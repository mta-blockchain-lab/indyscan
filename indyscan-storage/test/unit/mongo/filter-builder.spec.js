/* eslint-env jest */

const { mongoFilterByTxTypeNames } = require('../../../src/mongo/filter-builder')

describe('basic storage test', () => {
  it('should build transaction filter by txType correctly', () => {
    const txFilter = mongoFilterByTxTypeNames(['SCHEMA', 'CLAIM_DEF'])
    expect(JSON.stringify(txFilter)).toBe(JSON.stringify({ '$or': [{ 'txn.type': '101' }, { 'txn.type': '102' }] }))
  })

  it('should build empty filter if no txNames are passed', () => {
    const txFilter = mongoFilterByTxTypeNames([])
    expect(JSON.stringify(txFilter)).toBe(JSON.stringify({}))
  })
})
