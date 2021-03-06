const _ = require('lodash')
const assert = require('assert')
const { transformPoolUpgrade } = require('./config/pool-upgrade')
const { createClaimDefTransform } = require('./domain/claim-def')
const { createNodeTransform } = require('./pool/node')
const { transformNymAttrib } = require('./domain/nym-attrib')
const { txTypeToSubledgerName, txTypeToTxName, subledgerNameToId } = require('indyscan-txtype/src/types')

function createIndyscanTransform (resolveDomainTxBySeqNo, geoipLiteLookupIp) {
  function noop (tx) {
    return Object.assign({}, tx)
  }

  const txTransforms = {
    'NYM': transformNymAttrib,
    'ATTRIB': transformNymAttrib,
    'SCHEMA': noop,
    'CLAIM_DEF': createClaimDefTransform(resolveDomainTxBySeqNo),
    'REVOC_REG_DEF': noop,
    'REVOC_REG_ENTRY': noop,
    'SET_CONTEXT': noop,
    'NODE': createNodeTransform(geoipLiteLookupIp),
    'POOL_UPGRADE': transformPoolUpgrade,
    'NODE_UPGRADE': noop,
    'POOL_CONFIG': noop,
    'AUTH_RULE': noop,
    'AUTH_RULES': noop,
    'TXN_AUTHOR_AGREEMENT': noop,
    'TXN_AUTHOR_AGREEMENT_AML': noop,
    'SET_FEES': noop,
    'UNKNOWN': noop
  }

  /*
  Should never throw. If tx specific transformation fails, this informmation will be captured in result object under
  "transformed.meta.transformError" object with fields "message" and "stack"
   */
  async function createEsTransformedTx (tx) {
    if (!tx) {
      throw Error('tx argument not defined')
    }
    const { type: txnType } = tx.txn
    assert(txnType !== undefined)
    const txnTypeName = txTypeToTxName(txnType) || 'UNKNOWN'
    const subledgerName = txTypeToSubledgerName(txnType) || 'UNKNOWN'
    const subledgerCode = subledgerNameToId(subledgerName) || 'UNKNOWN'
    let transformed = _.cloneDeep(tx)

    // genesis txs do not have time
    if (transformed.txnMetadata && transformed.txnMetadata.txnTime) {
      let epochMiliseconds = transformed.txnMetadata.txnTime * 1000
      transformed.txnMetadata.txnTime = new Date(epochMiliseconds).toISOString()
    }
    transformed.txn.typeName = txnTypeName
    transformed.subledger = {
      code: subledgerCode,
      name: subledgerName
    }
    transformed.meta = {}

    try {
      const transform = txTransforms[txnTypeName]
      transformed = await transform(transformed)
    } catch (err) {
      transformed.meta.transformError = {
        message: err.message,
        stack: err.stack
      }
    }
    return transformed
  }

  return createEsTransformedTx
}

module.exports.createIndyscanTransform = createIndyscanTransform
