import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const spec=JSON.parse(fs.readFileSync(path.join(root,'openapi.json'),'utf8'))
const generated=fs.readFileSync(path.join(root,'src','generated.ts'),'utf8')
if(!generated.startsWith('// GENERATED FROM openapi.json - DO NOT EDIT')) throw new Error('SDK output is not generated from canonical OpenAPI contract')
if(/from ['"](?:\.\.\/)+src\//.test(generated)||/from ['"]@\//.test(generated)) throw new Error('Generated SDK imports application-internal modules')
const operations=[]
for(const methods of Object.values(spec.paths||{})) for(const [method,op] of Object.entries(methods)) if(method!=='parameters' && op.operationId) operations.push(op.operationId)
if(new Set(operations).size!==operations.length) throw new Error('Duplicate operationId in canonical SDK contract')
for(const id of operations) if(!new RegExp(`\\b${id}\\(`).test(generated)) throw new Error(`Missing generated client method: ${id}`)
console.log(`SDK contract verified: ${operations.length} operations, no internal imports`)
