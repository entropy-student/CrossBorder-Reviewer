// Review-only, no application write, network call, credential read, or DB access.
// Load original pure functions into a VM; strip CLI/imports, never execute writers.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const source = 'C:/Users/34707/Documents/ChatGPT/跨境电商/CrossBorder-Independent-Store'
const read = p => JSON.parse(readFileSync(path.join(source, p), 'utf8'))
const load = (relative, functions) => {
  const absolute = path.join(source, relative)
  let text = readFileSync(absolute, 'utf8').split(/\r?\ntry \{/)[0]
  text = text.replace(/^#!.*\r?\n/, '').replace(/^import .*\r?\n/gm, '')
    .replaceAll('import.meta.dirname', JSON.stringify(path.dirname(absolute)))
  const context = vm.createContext({ path, URL, console, structuredClone })
  return vm.runInContext(text + '\n;({' + functions.join(',') + '})', context)
}
const p = load('05_product/scripts/product-pipeline.mjs', ['validateRecord', 'buildMedusaPlan'])
const u = load('05_product/scripts/medusa-product-upsert.mjs', ['buildPayload', 'updatePayload', 'assertProductReadback'])
const c = load('05_product/sourcing/scripts/component-pipeline.mjs', ['validateComponent', 'validateComponentShape', 'validateBom'])
const master = read('05_product/normalized/PAWFECTLY-PET-HAIR-REMOVER.json')
const component = read('05_product/sourcing/components/COMP-001-pet-hair-remover.json')
const output = []
function probe(name, fn) {
  try { output.push({name, observation:fn()}) } catch(error) { output.push({name, error:error.message}) }
}
const productMutation = fn => { const r = structuredClone(master); fn(r); const v = p.validateRecord(r); return {result:v.result, gates:v.gates, issues:v.issues}; }
probe('CURRENT_MASTER_GATES', () => p.validateRecord(master))
probe('MISSING_VARIANT_OPTION_PASSES', () => productMutation(r => { r.commerce.variants[0].options = {} }))
probe('DUPLICATE_OPTION_COMBINATIONS_PASS', () => productMutation(r => { r.commerce.variants.push({...structuredClone(r.commerce.variants[0]),internal_sku:'PAW-PHR-002'}) }))
probe('FRACTIONAL_AND_NEGATIVE_INVENTORY_PASS', () => productMutation(r => { r.commerce.inventory_quantity=-1.5; r.commerce.variants[0].inventory_quantity=-1.5 }))
probe('INVALID_MAIN_IMAGE_URL_PASSES_PUBLISH', () => productMutation(r => { r.assets.main_image.url='not-a-valid-image-url' }))
probe('FIXTURE_RECORD_TYPE_WITH_PUBLISHED_STATUS_PASSES', () => productMutation(r => { r.record_type='TEST_FIXTURE_ONLY' }))
probe('PREVIEW_TO_PRODUCTION_LEAVES_INVENTORY_UNMANAGED', () => {
  const r=structuredClone(master); r.commerce.availability_mode='PRODUCTION_INVENTORY';
  r.commerce.inventory_status='IN_STOCK'; r.commerce.inventory_quantity=10;
  r.commerce.variants[0].inventory_status='IN_STOCK';r.commerce.variants[0].inventory_quantity=10;
  const out=u.updatePayload(u.buildPayload(r,'published'),{variants:[{sku:r.commerce.variants[0].internal_sku,id:'variant_review',manage_inventory:false}]});
  return {gate:p.validateRecord(r).gates, updateVariant:out.variants[0], setsManageInventory:Object.hasOwn(out.variants[0],'manage_inventory')}
})
probe('DRY_RUN_VS_ACTUAL_PAYLOAD', () => {
  const dry=p.buildMedusaPlan(master,p.validateRecord(master)).medusa_payload;
  const actual=u.buildPayload(master,'published');
  return {onlyDryMetadata:Object.keys(dry.metadata).filter(k=>!Object.hasOwn(actual.metadata,k)),onlyActualMetadata:Object.keys(actual.metadata).filter(k=>!Object.hasOwn(dry.metadata,k)),actualSensitiveMetadataKeys:Object.keys(actual.metadata).filter(k=>/cost|supplier|sourcing|bulk|gate|approved/.test(k))}
})
probe('SECOND_VARIANT_WRONG_PRICE_READBACK_NOT_DETECTED', () => {
  const r=structuredClone(master); r.commerce.variants.push({...structuredClone(r.commerce.variants[0]),internal_sku:'PAW-PHR-002',selling_price:99});
  const payload=u.buildPayload(r,'published');
  const returned={...payload,id:'prod_review',variants:payload.variants.map((v,i)=>({...v,id:`v${i}`,prices:i?[{currency_code:'usd',amount:1}]:v.prices}))};
  return {accepted:Boolean(u.assertProductReadback(returned,r,'published')),expectedSecondPrice:99,returnedSecondPrice:1}
})
probe('KNOWN_SUPPLIER_EVIDENCE_BLOCKED_BY_FIXED_UNKNOWN_CHECK', () => {
  const r=structuredClone(component);r.identity.supplier_name='Review verified supplier';return c.validateComponent(r)
})
probe('FAILED_SAMPLE_WITH_HARD_FAIL_RETURNS_NEEDS_TEST', () => {
  const r=structuredClone(component);r.sample.test_status='FAIL';r.sample.hard_fail='YES';r.sample.score=0;r.sample.decision='FAIL';return c.validateComponent(r)
})
probe('SAMPLE_PASS_WITH_HARD_FAIL_AND_PROCUREMENT_OPEN_ACCEPTED_IN_GATES', () => {
  const r=structuredClone(component);r.sample.test_status='PASS';r.sample.hard_fail='YES';r.sample.score=0;r.sample.decision='FAIL';r.procurement.bulk_order_gate='OPEN';return c.validateComponent(r)
})
probe('NEGATIVE_COMPONENT_MEASUREMENT_SCHEMA_ACCEPTED', () => {
  const r=structuredClone(component);r.physical.product_weight.value=-196;return c.validateComponent(r)
})
const report={generatedAt:new Date().toISOString(),method:'Pure source function evaluation in Node VM; original source files unchanged; no external side effects',results:output}
writeFileSync(path.join(import.meta.dirname,'product-independent-probes.json'),JSON.stringify(report,null,2)+'\n')
console.log(output.map(x=>JSON.stringify({name:x.name,error:x.error,observation:x.observation})).join('\n'))
