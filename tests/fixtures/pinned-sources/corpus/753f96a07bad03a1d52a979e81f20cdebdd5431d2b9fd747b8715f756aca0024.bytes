# Functions workbench corpus, version 1

Canonical bytes live here on `workbench/functions-20261004` in bpmn-moddle-py.
The JS lane must mirror every file listed in `MANIFEST.sha256` without regenerating
fixtures. Hash the manifest itself as well as verifying each listed file. No
customer content, historical customer topology, or prior codec golden is used.

`scripts/workbench/author_corpus.py` is the independent authoring provenance.
It imports no bpmn-io runtime. Its reviewed default table and explicit XML fixture
vocabulary specify expected semantics before implementation; expected files must
never be updated from a failing codec's output. Descriptor bytes are copied from
the pinned local Python resources and the local JS semantic descriptor.

`index.json` selects isolated F1/F7 cases. W09 errors are first-error code/JSON
pointer tuples, selected by sorted property traversal (references resolve after
containment creation). W09-version uses an unregistered semantics/2 type; the
frozen registered descriptor is semantics/1. W10/W11 remain accepted by F1:
lint and export-capability checks are separate gates. W12 is data for G4.

All known nonvirtual defaults are explicit in projected JSON. Nondefault absent
properties stay absent; explicitly empty arrays stay present. XML may omit a
descriptor default, but parse/write must preserve its effective value. Only
unqualified unknown XML attributes with string values are accepted; their
cross-runtime round trip is exercised in W06. Unknown qualified attributes,
generic extensions, private fields and virtual properties fail explicitly.

`config.json`, `comparators.json` and `canonical-vectors.json` pin the comparison
policy. Arrays, strings, coordinates and colors are exact. No layout/lint/style
function is invoked to prepare serializer inputs. Geometry is manually assigned.
XML goldens use the same semantics with independent namespace/formatting choices.

The frozen lint scope contains five rules. This is not a verified inventory of
all upstream rules: local bpmnlint source/version/hash are unknown under the
offline restriction. G3 must establish those pins and implement this scope.
Layout text metrics and final format envelopes remain explicitly unknown, so
these fixtures do not pre-certify G3–G8 or private interoperability acceptance.
