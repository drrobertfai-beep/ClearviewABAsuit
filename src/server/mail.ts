// ClearView ABA Suite — outbound mail (SMTP) — server-only
//
// Sends the practice-invite email. There is no vendor SDK here: the SMTP
// conversation is spoken directly over node:net / node:tls, so it runs
// unchanged under Node (Vercel) and Bun (local dev) and works with any mail
// provider the business points at.
//
// Configuration comes from the environment, read at call time so a secret
// saved after the deployment is picked up:
//
//   SMTP_HOST   mail server hostname            (required)
//   SMTP_PORT   port — 465 implies implicit TLS (default 587, STARTTLS)
//   SMTP_USER   AUTH user                       (optional)
//   SMTP_PASS   AUTH password                   (optional)
//   MAIL_FROM   From header, bare address or "Name <address>" (required)
//
// When SMTP_HOST or MAIL_FROM is unset the feature is simply off: nothing is
// sent, no error is raised, and the invite page keeps working as a copyable
// link. A send failure is logged and swallowed for the same reason — the
// invite itself has already been created and its link is still on screen.

// Node built-ins are imported lazily (and only as types at the top) so this
// module never drags `node:net` into the browser bundle — the same rule the
// rest of ~/server follows.
import type * as Net from "node:net";
import type * as Tls from "node:tls";

import { createServerFn } from "@tanstack/react-start";
import { requirePracticeRole } from "~/server/auth-guard";
import type { PracticeRole } from "~/db/types";

const MANAGE_ROLES: PracticeRole[] = ["owner", "admin"];

/** The domain the owner actually shares — the same base the invite UI copies. */
const INVITE_BASE = "https://getclearviewaba.com";

/** Give up on a stalled mail server rather than hold the request open. */
const SMTP_TIMEOUT_MS = 15_000;

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/** Read the mail settings from the environment. Null when mail is not set up. */
export function readSmtpConfig(): SmtpConfig | null {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const from = (process.env.MAIL_FROM ?? "").trim();
  if (!host || !from) return null;

  const rawPort = Number.parseInt((process.env.SMTP_PORT ?? "").trim(), 10);
  const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 587;

  return {
    host,
    port,
    user: (process.env.SMTP_USER ?? "").trim(),
    pass: process.env.SMTP_PASS ?? "",
    from,
  };
}

// ---------------------------------------------------------------------------
// Minimal SMTP conversation
// ---------------------------------------------------------------------------

type SmtpSocket = Net.Socket | Tls.TLSSocket;

interface SmtpReply {
  code: number;
  text: string;
}

type Waiter = {
  resolve: (reply: SmtpReply) => void;
  reject: (err: Error) => void;
};

class SmtpConnection {
  private socket: SmtpSocket | null = null;
  private buffer = "";
  private partialLines: string[] = [];
  private replies: SmtpReply[] = [];
  private waiters: Waiter[] = [];
  private failure: Error | null = null;

  private readonly onData = (chunk: string) => this.consume(chunk);
  private readonly onError = (err: Error) => this.fail(err);
  private readonly onClose = () =>
    this.fail(new Error("SMTP connection closed unexpectedly."));
  private readonly onTimeout = () =>
    this.fail(new Error("SMTP connection timed out."));

  /** Attach to a socket, detaching from any previous one (TLS upgrade). */
  attach(socket: SmtpSocket): void {
    this.detach();
    this.socket = socket;
    this.buffer = "";
    socket.setEncoding("utf8");
    socket.setTimeout(SMTP_TIMEOUT_MS);
    socket.on("data", this.onData);
    socket.on("error", this.onError);
    socket.on("close", this.onClose);
    socket.on("timeout", this.onTimeout);
  }

  detach(): void {
    const socket = this.socket;
    if (!socket) return;
    socket.removeListener("data", this.onData);
    socket.removeListener("error", this.onError);
    socket.removeListener("close", this.onClose);
    socket.removeListener("timeout", this.onTimeout);
    this.socket = null;
  }

  /** The live socket, for the STARTTLS upgrade. */
  get rawSocket(): SmtpSocket | null {
    return this.socket;
  }

  /** Write one command line (CRLF added). */
  write(line: string): void {
    if (!this.socket) throw new Error("SMTP connection is not open.");
    this.socket.write(`${line}\r\n`);
  }

  /** Send a command and return its reply, throwing on 4xx/5xx. */
  async command(line: string): Promise<SmtpReply> {
    this.write(line);
    const reply = await this.read();
    if (reply.code >= 400) {
      throw new Error(`SMTP ${reply.code}: ${reply.text.split("\n").join(" ")}`);
    }
    return reply;
  }

  /** Wait for the next complete reply (multi-line replies are one reply). */
  read(): Promise<SmtpReply> {
    if (this.failure) return Promise.reject(this.failure);
    const ready = this.replies.shift();
    if (ready) return Promise.resolve(ready);
    return new Promise<SmtpReply>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  close(): void {
    const socket = this.socket;
    this.detach();
    try {
      socket?.end();
      socket?.destroy();
    } catch {
      // Already gone — nothing to clean up.
    }
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\n");
    while (index >= 0) {
      const raw = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      this.consumeLine(raw.endsWith("\r") ? raw.slice(0, -1) : raw);
      index = this.buffer.indexOf("\n");
    }
  }

  private consumeLine(line: string): void {
    this.partialLines.push(line);
    const match = /^(\d{3})([ -])?/.exec(line);
    const continues = match?.[2] === "-";
    if (!match || continues) return;

    const reply: SmtpReply = {
      code: Number(match[1]),
      text: this.partialLines.join("\n"),
    };
    this.partialLines = [];
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve(reply);
    else this.replies.push(reply);
  }

  private fail(err: Error): void {
    if (this.failure) return;
    this.failure = err;
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) waiter.reject(err);
  }
}

function waitForSecureConnect(socket: Tls.TLSSocket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (!socket.connecting) {
      resolve();
      return;
    }
    socket.once("secureConnect", () => resolve());
    socket.once("error", (err) => reject(err));
  });
}

/** Bare address out of `Name <addr>` or `addr`. */
function envelopeAddress(value: string): string {
  const angled = /<([^>]+)>/.exec(value);
  return (angled ? angled[1] : value).trim();
}

/** Non-ASCII subjects need RFC 2047 encoding; ASCII ones are left alone. */
function encodeSubject(subject: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

async function buildMessage(
  config: SmtpConfig,
  message: { to: string; subject: string; body: string; replyTo?: string },
): Promise<string> {
  const { randomUUID } = await import("node:crypto");
  const domain = envelopeAddress(config.from).split("@")[1] ?? "getclearviewaba.com";
  const encodedBody = Buffer.from(message.body, "utf8").toString("base64");
  const bodyLines: string[] = [];
  for (let i = 0; i < encodedBody.length; i += 76) {
    bodyLines.push(encodedBody.slice(i, i + 76));
  }

  const headers = [
    `From: ${config.from}`,
    `To: ${message.to}`,
    ...(message.replyTo ? [`Reply-To: ${message.replyTo}`] : []),
    `Subject: ${encodeSubject(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
  ];

  // The body is base64, so no line can start with "." and no dot-stuffing is
  // needed; every line is short enough for the 1000-octet SMTP limit.
  return `${[...headers, "", ...bodyLines].join("\r\n")}\r\n`;
}

async function authenticate(
  connection: SmtpConnection,
  config: SmtpConfig,
  capabilities: string,
): Promise<void> {
  const caps = capabilities.toUpperCase();
  const login = Buffer.from(config.user, "utf8").toString("base64");
  const secret = Buffer.from(config.pass, "utf8").toString("base64");

  if (caps.includes("AUTH") && /PLAIN/.test(caps)) {
    const token = Buffer.from(`\0${config.user}\0${config.pass}`, "utf8").toString(
      "base64",
    );
    try {
      const reply = await connection.command(`AUTH PLAIN ${token}`);
      if (reply.code === 235) return;
    } catch {
      // Fall through to LOGIN below.
    }
  }

  await connection.command("AUTH LOGIN");
  await connection.command(login);
  await connection.command(secret);
}

/** Speak SMTP end to end and hand one message to the server. */
export async function sendSmtpMessage(
  config: SmtpConfig,
  message: { to: string; subject: string; body: string; replyTo?: string },
): Promise<void> {
  const net = await import("node:net");
  const tls = await import("node:tls");

  const connection = new SmtpConnection();
  const implicitTls = config.port === 465;

  try {
    if (implicitTls) {
      const secure = tls.connect({
        host: config.host,
        port: config.port,
        servername: config.host,
      });
      connection.attach(secure);
      await waitForSecureConnect(secure);
    } else {
      connection.attach(net.connect({ host: config.host, port: config.port }));
    }

    const greeting = await connection.read();
    if (greeting.code !== 220) {
      throw new Error(`SMTP ${greeting.code}: ${greeting.text}`);
    }

    const heloName = envelopeAddress(config.from).split("@")[1] ?? "getclearviewaba.com";
    let reply = await connection.command(`EHLO ${heloName}`);
    let capabilities = reply.text;

    if (!implicitTls && /STARTTLS/i.test(capabilities)) {
      await connection.command("STARTTLS");
      const socket = connection.rawSocket;
      if (!socket) throw new Error("SMTP connection is not open.");
      const secure = tls.connect({ socket, servername: config.host });
      connection.attach(secure);
      await waitForSecureConnect(secure);
      reply = await connection.command(`EHLO ${heloName}`);
      capabilities = reply.text;
    }

    if (config.user) {
      await authenticate(connection, config, capabilities);
    }

    await connection.command(`MAIL FROM:<${envelopeAddress(config.from)}>`);
    await connection.command(`RCPT TO:<${envelopeAddress(message.to)}>`);
    await connection.command("DATA");
    connection.write((await buildMessage(config, message)).replace(/\r\n$/, ""));
    connection.write(".");
    const stored = await connection.read();
    if (stored.code !== 250) {
      throw new Error(`SMTP ${stored.code}: ${stored.text.split("\n").join(" ")}`);
    }
    await connection.command("QUIT");
  } finally {
    connection.close();
  }
}

// ---------------------------------------------------------------------------
// The invite email
// ---------------------------------------------------------------------------

const ROLE_WORDS: Record<string, string> = {
  owner: "an owner",
  admin: "an admin",
  clinician: "a clinician",
  viewer: "a read-only viewer",
};

export interface InviteEmailInput {
  to: string;
  practiceName: string;
  role: string;
  token: string;
  expiresAt: string | null;
  invitedBy: string;
}

/** Compose the invite email. Plain text only — nothing to render, nothing to track. */
export function buildInviteEmail(input: InviteEmailInput): {
  subject: string;
  body: string;
} {
  const link = `${INVITE_BASE}/invite/${input.token}`;
  const roleWord = ROLE_WORDS[input.role] ?? "a team member";
  const expires = input.expiresAt
    ? new Date(input.expiresAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;

  const subject = `${input.invitedBy} invited you to ${input.practiceName} on ClearView ABA Suite`;
  const body = [
    "Hello,",
    "",
    `${input.invitedBy} invited you to join ${input.practiceName} on ClearView ABA Suite as ${roleWord}.`,
    "",
    "Open this link to accept the invite and set up your account:",
    link,
    "",
    ...(expires ? [`This link expires on ${expires}.`] : []),
    "If you were not expecting this invitation, you can ignore this email.",
    "",
    "— ClearView ABA Suite",
    INVITE_BASE,
  ].join("\n");

  return { subject, body };
}

/**
 * sendPracticeInviteEmailFn — email an existing invite link to the address it
 * was created for.
 *
 * The caller passes only the invite token; the recipient address, role and
 * expiry are read back from the invite row, scoped to the caller's practice, so
 * this cannot be used to mail an arbitrary address. Returns `{ sent }` and
 * never throws on a mail problem: with no SMTP settings, or a server that
 * refuses, the invite page keeps showing the copyable link.
 */
export const sendPracticeInviteEmailFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { token?: unknown })
  .handler(async ({ data }) => {
    const { practiceId, user } = await requirePracticeRole(MANAGE_ROLES);

    const token = typeof data?.token === "string" ? data.token.trim() : "";
    if (!token) return { sent: false as const, configured: readSmtpConfig() !== null };

    const config = readSmtpConfig();
    if (!config) return { sent: false as const, configured: false };

    const db = await import("~/db/practice-members");
    const invite = await db.getPendingInviteForPractice(practiceId, token);
    if (!invite) return { sent: false as const, configured: true };

    const { subject, body } = buildInviteEmail({
      to: invite.email,
      practiceName: invite.practiceName,
      role: invite.role,
      token,
      expiresAt: invite.expiresAt,
      invitedBy: user.email,
    });

    try {
      await sendSmtpMessage(config, {
        to: invite.email,
        subject,
        body,
        replyTo: user.email,
      });
      return { sent: true as const, configured: true };
    } catch (err) {
      // The invite exists and its link is on screen; a mail failure must not
      // turn that into an error the user has to act on.
      console.error(
        "[mail] invite email failed:",
        err instanceof Error ? err.message : err,
      );
      return { sent: false as const, configured: true };
    }
  });
