// ArchiMate 3.2 catalogue and pairwise matrix cells (spec §A.1, frozen deb64b75).
// Governed data: compact cell encoding transcribed verbatim from the frozen spec.
// Tuple expansion follows the spec A.1 expansion recipe exactly.
// No executor, layout or rendering lives here (G2: Engram governs data only).

export interface CatalogueRow {
  readonly name: string;
  readonly id: string;
  readonly layer: string;
  readonly aspect: string;
}

/** 61 concrete catalogue rows (the Relationship pseudo-concept is not an entity type). */
export const ARCHIMATE_CATALOGUE: readonly CatalogueRow[] = [{"name":"ApplicationCollaboration","id":"application-collaboration","layer":"application","aspect":"active"},{"name":"ApplicationComponent","id":"application-component","layer":"application","aspect":"active"},{"name":"ApplicationEvent","id":"application-event","layer":"application","aspect":"behaviour"},{"name":"ApplicationFunction","id":"application-function","layer":"application","aspect":"behaviour"},{"name":"ApplicationInteraction","id":"application-interaction","layer":"application","aspect":"behaviour"},{"name":"ApplicationInterface","id":"application-interface","layer":"application","aspect":"active"},{"name":"ApplicationProcess","id":"application-process","layer":"application","aspect":"behaviour"},{"name":"ApplicationService","id":"application-service","layer":"application","aspect":"behaviour"},{"name":"Artifact","id":"artifact","layer":"technology","aspect":"passive"},{"name":"Assessment","id":"assessment","layer":"motivation","aspect":"motivation"},{"name":"BusinessActor","id":"business-actor","layer":"business","aspect":"active"},{"name":"BusinessCollaboration","id":"business-collaboration","layer":"business","aspect":"active"},{"name":"BusinessEvent","id":"business-event","layer":"business","aspect":"behaviour"},{"name":"BusinessFunction","id":"business-function","layer":"business","aspect":"behaviour"},{"name":"BusinessInteraction","id":"business-interaction","layer":"business","aspect":"behaviour"},{"name":"BusinessInterface","id":"business-interface","layer":"business","aspect":"active"},{"name":"BusinessObject","id":"business-object","layer":"business","aspect":"passive"},{"name":"BusinessProcess","id":"business-process","layer":"business","aspect":"behaviour"},{"name":"BusinessRole","id":"business-role","layer":"business","aspect":"active"},{"name":"BusinessService","id":"business-service","layer":"business","aspect":"behaviour"},{"name":"Capability","id":"capability","layer":"strategy","aspect":"behaviour"},{"name":"CommunicationNetwork","id":"communication-network","layer":"technology","aspect":"active"},{"name":"Constraint","id":"constraint","layer":"motivation","aspect":"motivation"},{"name":"Contract","id":"contract","layer":"business","aspect":"passive"},{"name":"CourseOfAction","id":"course-of-action","layer":"strategy","aspect":"behaviour"},{"name":"DataObject","id":"data-object","layer":"application","aspect":"passive"},{"name":"Deliverable","id":"deliverable","layer":"implementation","aspect":"passive"},{"name":"Device","id":"device","layer":"technology","aspect":"active"},{"name":"DistributionNetwork","id":"distribution-network","layer":"physical","aspect":"active"},{"name":"Driver","id":"driver","layer":"motivation","aspect":"motivation"},{"name":"Equipment","id":"equipment","layer":"physical","aspect":"active"},{"name":"Facility","id":"facility","layer":"physical","aspect":"active"},{"name":"Gap","id":"gap","layer":"implementation","aspect":"passive"},{"name":"Goal","id":"goal","layer":"motivation","aspect":"motivation"},{"name":"Grouping","id":"grouping","layer":"none","aspect":"composite"},{"name":"ImplementationEvent","id":"implementation-event","layer":"implementation","aspect":"behaviour"},{"name":"Junction","id":"junction","layer":"none","aspect":"other"},{"name":"Location","id":"location","layer":"none","aspect":"composite"},{"name":"Material","id":"material","layer":"physical","aspect":"passive"},{"name":"Meaning","id":"meaning","layer":"motivation","aspect":"motivation"},{"name":"Node","id":"node","layer":"technology","aspect":"active"},{"name":"Outcome","id":"outcome","layer":"motivation","aspect":"motivation"},{"name":"Path","id":"path","layer":"technology","aspect":"active"},{"name":"Plateau","id":"plateau","layer":"implementation","aspect":"composite"},{"name":"Principle","id":"principle","layer":"motivation","aspect":"motivation"},{"name":"Product","id":"product","layer":"business","aspect":"composite"},{"name":"Representation","id":"representation","layer":"business","aspect":"passive"},{"name":"Requirement","id":"requirement","layer":"motivation","aspect":"motivation"},{"name":"Resource","id":"resource","layer":"strategy","aspect":"active"},{"name":"Stakeholder","id":"stakeholder","layer":"motivation","aspect":"motivation"},{"name":"SystemSoftware","id":"system-software","layer":"technology","aspect":"active"},{"name":"TechnologyCollaboration","id":"technology-collaboration","layer":"technology","aspect":"active"},{"name":"TechnologyEvent","id":"technology-event","layer":"technology","aspect":"behaviour"},{"name":"TechnologyFunction","id":"technology-function","layer":"technology","aspect":"behaviour"},{"name":"TechnologyInteraction","id":"technology-interaction","layer":"technology","aspect":"behaviour"},{"name":"TechnologyInterface","id":"technology-interface","layer":"technology","aspect":"active"},{"name":"TechnologyProcess","id":"technology-process","layer":"technology","aspect":"behaviour"},{"name":"TechnologyService","id":"technology-service","layer":"technology","aspect":"behaviour"},{"name":"Value","id":"value","layer":"motivation","aspect":"motivation"},{"name":"ValueStream","id":"value-stream","layer":"strategy","aspect":"behaviour"},{"name":"WorkPackage","id":"work-package","layer":"implementation","aspect":"behaviour"}];

/** 62 ordered concept names (index 46 is the Relationship pseudo-concept). */
export const ARCHIMATE_CONCEPT_NAMES: readonly string[] = ["ApplicationCollaboration","ApplicationComponent","ApplicationEvent","ApplicationFunction","ApplicationInteraction","ApplicationInterface","ApplicationProcess","ApplicationService","Artifact","Assessment","BusinessActor","BusinessCollaboration","BusinessEvent","BusinessFunction","BusinessInteraction","BusinessInterface","BusinessObject","BusinessProcess","BusinessRole","BusinessService","Capability","CommunicationNetwork","Constraint","Contract","CourseOfAction","DataObject","Deliverable","Device","DistributionNetwork","Driver","Equipment","Facility","Gap","Goal","Grouping","ImplementationEvent","Junction","Location","Material","Meaning","Node","Outcome","Path","Plateau","Principle","Product","Relationship","Representation","Requirement","Resource","Stakeholder","SystemSoftware","TechnologyCollaboration","TechnologyEvent","TechnologyFunction","TechnologyInteraction","TechnologyInterface","TechnologyProcess","TechnologyService","Value","ValueStream","WorkPackage"];

/** 62 rows of 62 space-separated relation-key cells (`-` is the empty set). */
export const ARCHIMATE_MATRIX_CELLS: readonly string[] = [
  "cfgostv fgortv fiortv fiortv fiortv cfgortv fiortv fiortv ao no fotv fotv fortv fortv fortv fortv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or no fotv fotv fotv fotv fotv fotv fotv fotv no or o",
  "fotv cfgorstv fiortv fiortv fiortv cfgortv fiortv fiortv ao no fotv fotv fortv fortv fortv fortv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or no fotv fotv fotv fotv fotv fotv fotv fotv no or o",
  "fotv fotv cfgostv fotv fotv fotv fotv fotv ao no fotv fotv fortv fotv fotv fotv ao fotv fotv fotv o fotv nor ao o ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no o o",
  "fotv fotv fotv cfgostv cfgotv fotv cfgotv fortv ao no fotv fotv fotv fortv fortv fotv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no or o",
  "fotv fotv fotv cfgotv cfgostv fotv cfgotv fortv ao no fotv fotv fotv fortv fortv fotv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no or o",
  "fotv fotv fotv fotv fotv cfgostv fotv fiotv ao no fotv fotv fotv fotv fotv fortv ao fotv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or no fotv fotv fotv fotv fotv fotv fotv fotv no or o",
  "fotv fotv fotv cfgotv cfgotv fotv cfgostv fortv ao no fotv fotv fotv fortv fortv fotv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no or o",
  "fotv fotv fotv fotv fotv fotv fotv cfgostv ao no fotv fotv fotv fotv fotv fotv ao fotv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no or o",
  "or or or or or or or or cgors no o o or or or or or or o or or o nor or or or o o o no o o o nor cgnors o acfginorstv o o no o nor o o nor o o o nor or no or o or or or or or or no or o",
  "o o o o o o o o o cgnos o o o o o o o o o o o o no o o o o o o no o o o no cgnos o acfginorstv o o no o no o o no o o o no o no o o o o o o o o no o o",
  "fotv fotv fotv fotv fotv fotv fotv fotv ao no cfgostv fotv fiotv fiotv fiotv cfgiotv ao fiotv fiotv fiortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv io acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or ino fotv fotv fotv fotv fotv fotv fotv fotv no or io",
  "fotv fotv fotv fotv fotv fotv fotv fotv ao no fgotv cfgostv fiotv fiotv fiotv cfgiotv ao fiotv fgiotv fiortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv io acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or ino fotv fotv fotv fotv fotv fotv fotv fotv no or io",
  "fotv fotv fotv fotv fotv fotv fotv fotv ao no fotv fotv cfgostv fotv fotv fotv ao fotv fotv fotv o fotv nor ao o ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no o o",
  "fotv fotv fotv fotv fotv fotv fotv fotv ao no fotv fotv fotv cfgostv cfgotv fotv ao cfgotv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no or o",
  "fotv fotv fotv fotv fotv fotv fotv fotv ao no fotv fotv fotv cfgotv cfgostv fotv ao cfgotv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no or o",
  "fotv fotv fotv fotv fotv fotv fotv fotv ao no fotv fotv fotv fotv fotv cfgostv ao fotv fotv fiotv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or no fotv fotv fotv fotv fotv fotv fotv fotv no or o",
  "o o o o o o o o o no o o o o o o cgos o o o or o nor cgos or o o o o no o o o nor cgnors o acfginorstv o o no o nor o o nor o o o nor or no o o o o o o o o no or o",
  "fotv fotv fotv fotv fotv fotv fotv fotv ao no fotv fotv fotv cfgotv cfgotv fotv ao cfgostv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no or o",
  "fotv fotv fotv fotv fotv fotv fotv fotv ao no fotv fotv fiotv fiotv fiotv cfgotv ao fiotv cfgostv fiortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv io acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or ino fotv fotv fotv fotv fotv fotv fotv fotv no or io",
  "fotv fotv fotv fotv fotv fotv fotv fotv ao no fotv fotv fotv fotv fotv fotv ao fotv fotv cfgostv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv fotv no or o",
  "o o o o o o o o o no o o o o o o o o o o cfgostv o nor o fortv o o o o no o o o nor cfgnorstv o acfginorstv o o no o nor o o nor o o o nor fotv no o o o o o o o o no fotv o",
  "fortv fortv fortv fortv fortv fortv fortv fortv aio no fortv fortv fortv fortv fortv fortv ao fortv fortv fortv or cfgostv nor ao or ao o fgortv fotv no fortv fortv o nor acfginorstv o acfginorstv fotv ao no fortv nor fortv o nor fotv o ao nor or nor fgiortv fortv fiortv fiortv fiortv fgiortv fiortv fiortv no or o",
  "o o o o o o o o o no o o o o o o o o o o o o cgnos o o o o o o no o o o nor cgnors o acfginorstv o o no o nor o o nor o o o cgnos o no o o o o o o o o no o o",
  "o o o o o o o o o no o o o o o o cgos o o o or o nor cgos or o o o o no o o o nor cgnors o acfginorstv o o no o nor o o nor o o o nor or no o o o o o o o o no or o",
  "o o o o o o o o o no o o o o o o o o o o fotv o nor o cfgostv o o o o no o o o nor cfgnorstv o acfginorstv o o no o nor o o nor o o o nor fotv no o o o o o o o o no fotv o",
  "o o o o o o o o o no o o o o o o or o o o or o nor or or cgos o o o no o o o nor cgnors o acfginorstv o o no o nor o o nor o o o nor or no o o o o o o o o no or o",
  "or or or or or or or or or no or or or or or or or or or or or or nor or or or cgos or or no or or o nor cgnors o acfginorstv or or no or nor or or nor or o or nor or nor or or or or or or or or no or o",
  "fortv fortv fortv fortv fortv fortv fortv fortv aio no fotv fotv fortv fortv fortv fortv ao fortv fotv fortv or fotv nor ao or ao o cfgostv fotv no fotv fotv o nor acfginorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or no cfgiortv fotv fiortv fiortv fiortv cfgiortv fiortv fiortv no or o",
  "fortv fortv fortv fortv fortv fortv fortv fortv aio no fiortv fiortv fiortv fiortv fiortv fiortv ao fiortv fiortv fiortv or fotv nor ao or ao o fgiortv cfgostv no fgiortv fgiortv o nor acfginorstv io acfginorstv fotv aio no fgiortv nor fortv o nor fotv o ao nor or inor fgiortv fortv fiortv fiortv fiortv fgiortv fiortv fiortv no or io",
  "o o o o o o o o o no o o o o o o o o o o o o no o o o o o o cgnos o o o no cgnos o acfginorstv o o no o no o o no o o o no o no o o o o o o o o no o o",
  "fortv fortv fortv fortv fortv fortv fortv fortv aio no fotv fotv fortv fortv fortv fortv ao fortv fotv fortv or fotv nor ao or ao o cfgortv fotv no cfgorstv fotv o nor acfginorstv o acfginorstv fotv aio no fotv nor fotv o nor fotv o ao nor or no cfgiortv fotv fiortv fiortv fiortv cfgiortv fiortv fiortv no or o",
  "fortv fortv fortv fortv fortv fortv fortv fortv aio no fiotv fiotv fiortv fiortv fiortv fiortv ao fiortv fiotv fiortv or fotv nor ao or ao o cfgiortv fotv no cfgiortv cfgiostv o nor acfginorstv io acfginorstv fotv aio no cfgiotv nor fotv o nor fotv o ao nor or ino cfgiortv fotv fiortv fiortv fiortv cfgiortv fiortv fiortv no or io",
  "o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o cgos o cgos o acfginorstv o o o o o o o o o o o o o o o o o o o o o o o o o",
  "o o o o o o o o o no o o o o o o o o o o o o no o o o o o o no o o o cgnos cgnos o acfginorstv o o no o no o o no o o o no o no o o o o o o o o no o o",
  "cfgorstv cfgorstv cfgiorstv cfgiorstv cfgiorstv cfgorstv cfgiorstv cfgiorstv acgiors cgnos cfgiorstv cfgiorstv cfgiorstv cfgiorstv cfgiorstv cfgiorstv acgors cfgiorstv cfgiorstv cfgiorstv cfgiorstv cfgorstv cgnors acgors cfgorstv acgors acgors cfgiorstv cfgorstv cgnos cfgiorstv cfgiorstv cgos cgnors acfginorstv cfgiost acfginorstv cfgorstv acgiors cgnos cfgiorstv cgnors cfgorstv cfgorst cgnors cfgorstv cgo acgors cgnors cfgorstv cginors cfgiorstv cfgorstv cfgiorstv cfgiorstv cfgiorstv cfgiorstv cfgiorstv cfgiorstv cgnos cfgiorstv cfgiost",
  "o o o o o o o o o no o o o o o o o o o o o o no o o o ao o o no o o o no acfgnost cfgost acfginorstv o o no o no o fot no o o o no o no o o o o o o o o no o fot",
  "fortv fortv fiortv fiortv fiortv fortv fiortv fiortv aior no fiortv fiortv fiortv fiortv fiortv fiortv aor fiortv fiortv fiortv fiortv fortv nor aor fortv aor aor fiortv fortv no fiortv fiortv o nor afinortv fiot acfginorstv fortv aior no fiortv nor fortv fort nor fortv - aor nor fortv inor fiortv fortv fiortv fiortv fiortv fiortv fiortv fiortv no fiortv fiot",
  "cfgortv cfgortv cfgiortv cfgiortv cfgiortv cfgortv cfgiortv cfgiortv acgio cgno cfgiortv cfgiortv cfgiortv cfgiortv cfgiortv cfgiortv acgo cfgiortv cfgiortv cfgiortv cgor cfgotv cgnor acgo cgor acgo cgo cfgiortv cfgotv cgno cfgiortv cfgiortv cgo cgnor acfginorstv cgio acfginorstv cfgostv acgio cgno cfgiortv cgnor cfgortv cgo cgnor cfgotv cgo acgo cgnor cgor cginor cfgiortv cfgortv cfgiortv cfgiortv cfgiortv cfgiortv cfgiortv cfgiortv cgno cgor cgio",
  "or or or or or or or or or no o o or or or or or or o or or o nor or or or o or o no or o o nor cgnors o acfginorstv o cgors no o nor o o nor o o o nor or no or o or or or or or or no or o",
  "o o o o o o o o o no o o o o o o o o o o o o no o o o o o o no o o o no cgnos o acfginorstv o o cgnos o no o o no o o o no o no o o o o o o o o no o o",
  "fortv fortv fortv fortv fortv fortv fortv fortv aio no fiotv fiotv fiortv fiortv fiortv fiortv ao fiortv fiotv fiortv or fotv nor ao or ao o cfgiortv fotv no cfgiortv cfgiotv o nor acfginorstv io acfginorstv fotv aio no cfgiostv nor fotv o nor fotv o ao nor or ino cfgiortv fotv fiortv fiortv fiortv cfgiortv fiortv fiortv no or io",
  "o o o o o o o o o no o o o o o o o o o o o o no o o o o o o no o o o nor cgnors o acfginorstv o o no o cgnos o o no o o o no o no o o o o o o o o no o o",
  "fortv fortv fortv fortv fortv fortv fortv fortv aio no fiotv fiotv fiortv fiortv fiortv fiortv ao fiortv fiotv fiortv or fotv nor ao or ao o fgiortv fotv no fgiortv fgiotv o nor acfginorstv io acfginorstv fotv aio no fgiotv nor cfgostv o nor fotv o ao nor or ino fgiortv fgotv fiortv fiortv fiortv fgiortv fiortv fiortv no or io",
  "cgor cgor cgor cgor cgor cgor cgor cgor cgor no cgor cgor cgor cgor cgor cgor cgor cgor cgor cgor cgor cgor cgnor cgor cgor cgor ao cgor cgor no cgor cgor o cgnor acfginorst fot acfginorstv cgor cgor no cgor cgnor cgor cfgost nor cgor cgo cgor cgnor cgor inor cgor cgor cgor cgor cgor cgor cgor cgor no cgor fot",
  "o o o o o o o o o no o o o o o o o o o o o o no o o o o o o no o o o nor cgnors o acfginorstv o o no o nor o o cgnos o o o no o no o o o o o o o o no o o",
  "fortv fortv fortv fortv fortv fortv fortv cfgortv acgo no fotv fotv fortv fortv fortv fortv acgo fortv fotv cfgortv or fotv nor acgo or acgo o fortv fotv no fortv fotv o nor acfgnorstv o acfginorstv fotv acgo no fotv nor fotv o nor cfgostv o acgo nor or no fortv fotv fortv fortv fortv fortv fortv cfgortv no or o",
  "o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o o - o o o o o o o o o - o o o o o o o o o o o o o o o",
  "o o o o o o o o o no o o o o o o or o o o or o nor or or o o o o no o o o nor cgnors o acfginorstv o o no o nor o o nor o o cgos nor or no o o o o o o o o no or o",
  "o o o o o o o o o no o o o o o o o o o o o o cgnos o o o o o o no o o o nor cgnors o acfginorstv o o no o nor o o nor o o o cgnos o no o o o o o o o o no o o",
  "o o o o o o o o o no o o o o o o o o o o fiotv o nor o fortv o o o o no o o o nor cfginorstv o acfginorstv o o no o nor o o nor o o o nor cfgostv no o o o o o o o o no fiotv o",
  "o o o o o o o o o no o o o o o o o o o o o o no o o o o o o no o o o no cgnos o acfginorstv o o no o no o o no o o o no o cgnos o o o o o o o o no o o",
  "fortv fortv fortv fortv fortv fortv fortv fortv aio no fotv fotv fortv fortv fortv fortv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or no cfgiorstv fotv fiortv fiortv fiortv cfgiortv fiortv fiortv no or o",
  "fortv fortv fortv fortv fortv fortv fortv fortv aio no fiotv fiotv fiortv fiortv fiortv fiortv ao fiortv fiotv fiortv or fotv nor ao or ao o fgiortv fotv no fgiortv fgiotv o nor acfginorstv io acfginorstv fotv aio no fgiotv nor fotv o nor fotv o ao nor or ino fgiortv cfgostv fiortv fiortv fiortv cfgiortv fiortv fiortv no or io",
  "fotv fotv fortv fotv fotv fotv fotv fotv ao no fotv fotv fortv fotv fotv fotv ao fotv fotv fotv o fotv nor ao o ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv cfgostv fotv fotv fotv fotv fotv no o o",
  "fotv fotv fotv fortv fortv fotv fortv fortv ao no fotv fotv fotv fortv fortv fotv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv cfgostv cfgotv fotv cfgotv fortv no or o",
  "fotv fotv fotv fortv fortv fotv fortv fortv ao no fotv fotv fotv fortv fortv fotv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv cfgotv cfgostv fotv cfgotv fortv no or o",
  "fotv fotv fotv fotv fotv fortv fotv fortv ao no fotv fotv fotv fotv fotv fortv ao fotv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfginorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor or no fotv fotv fotv fotv fotv cfgostv fotv fiotv no or o",
  "fotv fotv fotv fortv fortv fotv fortv fortv ao no fotv fotv fotv fortv fortv fotv ao fortv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv cfgotv cfgotv fotv cfgostv fortv no or o",
  "fotv fotv fotv fotv fotv fotv fotv fortv ao no fotv fotv fotv fotv fotv fotv ao fotv fotv fortv or fotv nor ao or ao o fotv fotv no fotv fotv o nor acfgnorstv o acfginorstv fotv ao no fotv nor fotv o nor fotv o ao nor o no fotv fotv fotv fotv fotv fotv fotv cfgostv no or o",
  "o o o o o o o o o no o o o o o o o o o o o o no o o o o o o no o o o no cgnos o acfginorstv o o no o no o o no o o o no o no o o o o o o o o cgnos o o",
  "o o o o o o o o o no o o o o o o o o o o fotv o nor o fortv o o o o no o o o nor cfgnorstv o acfginorstv o o no o nor o o nor o o o nor fotv no o o o o o o o o no cfgostv o",
  "or or or or or or or or or no or or or or or or or or or or or or nor or or or aor or or no or or o nor acfgnorst fot acfginorstv or or no or nor or fort nor or o or nor or nor or or or or or or or or no or cfgost",
];

/** Pinned oracle: RFC 8785 bytes / SHA-256 of the catalogue JSON array. */
export const CATALOGUE_BYTES = 5280;
export const CATALOGUE_SHA256 = "114cdca0c1e538f9cedf09613f415a6464bc9f4f54471c62ecfafcf6fede916e";
/** Pinned oracle: RFC 8785 bytes / SHA-256 of the expanded tuple array. */
export const TUPLES_BYTES = 1027156;
export const TUPLES_SHA256 = "a13f4112164afd177923a67b424d4c9b6ee57c1b993c4d11c94d5227385267f9";
/** Expanded tuple count: 11,569 permitted (relationship, source, target) tuples. */
export const TUPLES_COUNT = 11569;

export const RELATION_KEY: Readonly<Record<string, string>> = {
  a: "access", c: "composition", f: "flow", g: "aggregation",
  i: "assignment", n: "influence", o: "association", r: "realization",
  s: "specialization", t: "triggering", v: "serving",
};

export interface MatrixTuple {
  readonly relationType: string;
  readonly sourceType: string;
  readonly targetType: string;
}

/** Spec A.1 expansion recipe, transcribed verbatim (pure, deterministic). */
export function expandMatrixTuples(): MatrixTuple[] {
  const typeId = (name: string): string =>
    name === "Relationship" ? "@relation" : name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  const out: MatrixTuple[] = [];
  for (let i = 0; i < ARCHIMATE_MATRIX_CELLS.length; i++) {
    const keys = ARCHIMATE_MATRIX_CELLS[i]!.split(" ");
    for (let j = 0; j < keys.length; j++) {
      if (keys[j] === "-") continue;
      for (const k of keys[j]!) {
        out.push({
          relationType: RELATION_KEY[k]!,
          sourceType: typeId(ARCHIMATE_CONCEPT_NAMES[i]!),
          targetType: typeId(ARCHIMATE_CONCEPT_NAMES[j]!),
        });
      }
    }
  }
  return out;
}

/** Ordered-pair predicate over the expanded tuples (no Cartesian product). */
export function matrixAllows(tuples: readonly MatrixTuple[], relationship: string, source: string, target: string): boolean {
  return tuples.some(
    (t) => t.relationType === relationship && t.sourceType === source && t.targetType === target,
  );
}

