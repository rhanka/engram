// OpenERP lot type-level proof: every `@ts-expect-error` below must fail
// compilation when a closed shape drifts. Checked by
// `tsc --noEmit -p tsconfig.openerp-types.json`; vitest runs this file for
// its runtime assertions only.
import { describe, expect, it } from "vitest";

import type { Pin } from "../src/ontology-guardian/types.js";
import type { OpenerpCoverageRow } from "../src/ontology-guardian/openerp-mappings.js";
import { FIELD_LEVEL_BLOCKED_BY } from "../src/ontology-guardian/openerp-mappings.js";
import type {
  ConstraintEnforcement,
  TenantCarried,
} from "../src/ontology-guardian/openerp-constraints.js";
import {
  LINE_SOURCE_ENFORCEMENT,
  tenantCarriedOf,
} from "../src/ontology-guardian/openerp-constraints.js";
import type { OpenerpRelationEndpoint } from "../src/ontology-guardian/openerp-profile.js";
import { OPENERP_PIN } from "../src/ontology-guardian/openerp-profile.js";
import type { AdmissionTask } from "../src/ontology-guardian/openerp-registry.js";
import type { OpenerpColumnRow } from "../src/ontology-guardian/openerp-governed.js";

describe("openerp lot type-level proof", () => {
  it("holds the closed enforcement and carrying shapes at runtime", () => {
    const enforcement: ConstraintEnforcement = "application-convention";
    expect(enforcement).toBe(LINE_SOURCE_ENFORCEMENT);
    const carried: TenantCarried = tenantCarriedOf("invoices.company_id");
    expect(carried).toBe("unverified");
    expect(FIELD_LEVEL_BLOCKED_BY).toBe("OQ-OP-15");
    const pin: Pin = OPENERP_PIN;
    expect(pin.version).toBe("1");
    const task: AdmissionTask = { field: "corpusRef { ref, digest }", owner: "engram", question: "OQ-OP-08" };
    expect(task.question).toBe("OQ-OP-08");
    const column: OpenerpColumnRow = { entity: "users", name: "email", type: "text", notNull: true };
    expect(column.notNull).toBe(true);
  });

  it("keeps coverage rows closed over the unverified status", () => {
    const row: OpenerpCoverageRow = { type: "invoices", reference: "UBL 2.x", status: "unverified", owner: "OQ-OP-02" };
    expect(row.status).toBe("unverified");
    const endpoint: OpenerpRelationEndpoint = { key: "a.b", from: "a", to: "b" };
    expect(endpoint.to).toBe("b");
  });
});

// ConstraintEnforcement is the closed four-state union.
// @ts-expect-error carried is not a constraint enforcement
const badEnforcement: ConstraintEnforcement = "carried";

// TenantCarried is the closed three-state union.
// @ts-expect-error carried is not a tenant-carrying state
const badCarried: TenantCarried = "carried";

// Coverage status is the closed unverified literal.
// @ts-expect-error draft is not a coverage status
const badRow: OpenerpCoverageRow = { type: "invoices", reference: "x", status: "draft", owner: "OQ-OP-02" };

// Relation endpoint target is required.
// @ts-expect-error endpoint target is required
const badEndpoint: OpenerpRelationEndpoint = { key: "a.b", from: "a" };

// Admission tasks require their owning question.
// @ts-expect-error task question is required
const badTask: AdmissionTask = { field: "corpusRef", owner: "engram" };

// Column nullability is required.
// @ts-expect-error column notNull is required
const badColumn: OpenerpColumnRow = { entity: "users", name: "email", type: "text" };
