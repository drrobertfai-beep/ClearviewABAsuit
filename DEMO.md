# Demo data

The app ships with a re-runnable seed script that fills the database with a
complete, **obviously fictional** demo practice — 6 clients, 4 VB-MAPP
assessments (completed / in progress / draft), 3 treatment plans, signatures and
a matching audit log — so every screen looks like a working product.

## Seed it

```bash
cd /home/team/shared/site
bun src/db/seed-demo.ts
```

The script applies the schema (adding the `is_demo` marker columns if needed),
creates or refreshes the demo practitioner account, and re-inserts the demo
practice. It is **idempotent**: it deletes the demo rows it created last time
before inserting, so running it twice leaves exactly the same row counts. It
never touches rows that were not created by this script.

Demo sign-in:

| Field    | Value                   |
| -------- | ----------------------- |
| URL      | `/login`                |
| Email    | `demo@clearviewaba.com` |
| Password | `demo123456`            |
| Plan     | `practice` (active)     |

Every seeded row is flagged `is_demo = TRUE` (clients, assessments,
treatment_plans, signatures, audit_log). Client names are initials only, phone
numbers use the reserved `555-01xx` range, e-mails use `example.com`, insurers
and providers are labelled "(fictional)", and privacy notes start with
`DEMO DATA`. Nothing in the seed could be mistaken for real PHI.

## Remove it

```bash
cd /home/team/shared/site
bun src/db/seed-demo.ts --remove
```

This deletes only `is_demo = TRUE` rows. The demo user account is left in place
so you can still sign in to an empty app. To remove that too:

```sql
DELETE FROM users WHERE email = 'demo@clearviewaba.com';
```

## Notes

- The seed lives in `src/db/seed-demo.ts`; the fixtures at the top of the file
  are the place to edit names, scores and goals.
- `src/db/seed.ts` is the older, **destructive** seed (it wipes every table).
  Do not run it against a database you care about; use `seed-demo.ts` instead.
- Demo rows use fixed UUIDs (`de000000-0000-4000-8000-0000000001xx` for clients,
  `…02xx` assessments, `…03xx` plans), so links such as
  `/clients/de000000-0000-4000-8000-000000000101` stay valid across re-seeds.
