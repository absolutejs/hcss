# @absolutejs/hcss

Read-only HeavyJob client for Bun / fetch-compatible runtimes. No Dirt Tracker business rules.

```ts
import { createHcssClient } from '@absolutejs/hcss';
const hcss = createHcssClient({ clientId: process.env.HCSS_CLIENT_ID!, clientSecret: process.env.HCSS_CLIENT_SECRET! });
const units = await hcss.businessUnits();
const jobs = await hcss.jobs(units[0]!.id);
```

Supports business units, jobs, v2 cursor-paginated cost codes, job materials, and material advanced budgets. Uses only `heavyjob:read`. Tokens are cached in memory, with concurrent acquisition coalesced. HTTP bodies, requests, pagination and item counts are bounded; redirects are rejected; errors never include credentials or provider bodies. No automatic retries. A failed or truncated read never returns a partial list. Create a client per credential set. Do not expose it to browsers.

HCSS sandbox is a separate company credential context, not an assumed different API hostname. The caller must establish the correct company and authorization. Unknown units are preserved verbatim. Missing amounts and flags remain null, never zero/false. Budget IDs identify cost-code/material/purchase-order-detail relationships. Unknown response fields are discarded. This initial release has contract tests; live sandbox validation is pending access. No write endpoints are provided.

Sources: [credentials](https://developer.hcssapps.com/hcss/docs/client-credentials), [business units](https://developer.hcssapps.com/hcss/reference/businessunitcontroller_getbusinessunitsasync), [jobs](https://developer.hcssapps.com/hcss/reference/jobcontroller_getjobsv1async), [cost codes](https://developer.hcssapps.com/hcss/reference/costcodecontroller_getcostcodesv2async), [materials](https://developer.hcssapps.com/hcss/reference/materialcontroller_getjobmaterialsasync), [budgets](https://developer.hcssapps.com/hcss/reference/advancedbudgetcontroller_getmaterialsadvancedbudgetasync).
