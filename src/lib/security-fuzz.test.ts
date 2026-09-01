import {describe,it,expect} from 'vitest'
import {normalizeQuery,queryHash,assertGraphQLSafe} from './graphql-security'
describe('security fuzz corpus',()=>{const inputs=['','{','query{','mutation { x }','fragment x on X { y }','query { __schema { types { name } } }','query { '+'}'.repeat(1000),'{ x: me }'];for(const input of inputs){it(`does not crash on corpus ${JSON.stringify(input).slice(0,40)}`,()=>{expect(()=>{normalizeQuery(input);queryHash(input);try{assertGraphQLSafe(input)}catch{}}).not.toThrow()})}})
