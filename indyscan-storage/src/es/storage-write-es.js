/*
esClient - elasticsearch client
esIndex - name of the index to read/write data from/to
esReplicaCount - if <esIndex> doesn't exist yet, it will be created with <esReplicaCount> replicas
subledgerName - indy subledger managed by this storage client
assureEsIndex - whether shall this storage client try to create index if it doesnt exists. This is useful if you creating multiple
                storage clients (different subledgers) for the same network in parallel
expectEsIndex - if true and the esIndex is not already created, it will throw
createEsTransformedTx - function taking 1 argument, a transaction as found on ledger. Returns somewhat transformed transaction
                      - the transformed tx must contains root "meta" field, might be empty object
                      - should never throw, if an error occurs during processing, it should be stored in the result under
                        tx.meta.transformError field
logger (optional) - winston logger
 */
function createWinstonLoggerDummy () {
  let logger = {}
  logger.error = (param1, param2) => {}
  logger.warn = (param1, param2) => {}
  logger.info = (param1, param2) => {}
  logger.debug = (param1, param2) => {}
  logger.silly = (param1, param2) => {}
  return logger
}

async function createStorageWriteEs (esClient, esIndex, esReplicaCount, subledgerName, assureEsIndex, expectEsIndex, transformTx, logger) {
  if (logger === undefined) {
    logger = createWinstonLoggerDummy()
  }
  const whoami = `StorageWrite/${esIndex}/${subledgerName} : `
  const knownSubledgers = ['DOMAIN', 'POOL', 'CONFIG']
  const subledgerNameUpperCase = subledgerName.toUpperCase()
  if (knownSubledgers.includes(subledgerNameUpperCase) === false) {
    throw Error(`${whoami} Unknown subledger '${subledgerNameUpperCase}'. Known ledger = ${JSON.stringify(knownSubledgers)}`)
  }
  const existsResponse = await esClient.indices.exists({ index: esIndex })
  const { body: indexExists } = existsResponse
  if (indexExists === undefined || indexExists === null) {
    throw Error(`${whoami} Can't figure out if index ${esIndex} exists in ES. ES Response: ${JSON.stringify(existsResponse)}.`)
  }

  if (expectEsIndex && !indexExists) {
    throw Error(`${whoami} Index ${esIndex} was expected to already exist, but did not!`)
  }
  if (assureEsIndex && !indexExists) {
    await createEsIndex()
  }

  async function createEsIndex () {
    logger.info(`${whoami} Creating ES Index ${esIndex}!`)
    let createIndexRes = await esClient.indices.create({
      index: esIndex,
      body: {
        settings: {
          index: {
            number_of_replicas: esReplicaCount
          }
        }
      }
    })
    if (createIndexRes.statusCode !== 200) {
      throw Error(`Problem creating index ${esIndex}. ES Response: ${createIndexRes}`)
    }

    const coreMappings = {
      index: esIndex,
      body: {
        'properties': {
          'original': { type: 'text', index: false },

          // Every tx
          'indyscan.ver': { type: 'keyword' },
          'indyscan.rootHash': { type: 'keyword' },
          'indyscan.txn.type': { type: 'keyword' },
          'indyscan.txn.typeName': { type: 'keyword' },
          'indyscan.subledger.code': { type: 'keyword' },
          'indyscan.subledger.name': { type: 'keyword' },
          'indyscan.txn.protocolVersion': { type: 'keyword' },
          'indyscan.txn.metadata.from': { type: 'keyword' },
          'indyscan.txn.metadata.reqId': { type: 'keyword' },
          'indyscan.txn.data.data.blskey': { type: 'keyword' },
          'indyscan.txn.data.data.blskey_pop': { type: 'keyword' },
          'indyscan.meta.scanTime': { type: 'date', format: 'date_time' },

          'indyscan.txnMetadata.seqNo': { type: 'integer' },
          'indyscan.txnMetadata.txnTime': { type: 'date', format: 'date_time' },

          // TX: NYM, ATTRIB
          'indyscan.txn.data.raw': { type: 'text' },
          'indyscan.txn.data.dest': { type: 'keyword' },
          'indyscan.txn.data.verkeyFull': { type: 'keyword' },
          'indyscan.txn.data.roleAction': { type: 'keyword' },

          // TX: CLAIM_DEF
          'indyscan.txn.data.refSchemaTxnSeqno': { type: 'integer' },
          'indyscan.txn.data.refSchemaTxnTime': { type: 'date', format: 'date_time' },
          'indyscan.txn.data.refSchemaVersion': { type: 'keyword' },
          'indyscan.txn.data.refSchemaFrom': { type: 'keyword' },

          // TX: pool NODE transaction
          'indyscan.txn.data.data.client_ip': { type: 'text', 'fields': { 'raw': { 'type': 'keyword' }, 'as_ip': { type: 'ip', 'ignore_malformed': true } } },
          'indyscan.txn.data.data.client_port': { type: 'integer' },
          'indyscan.txn.data.data.node_ip': { type: 'text', 'fields': { 'raw': { 'type': 'keyword' }, 'as_ip': { type: 'ip', 'ignore_malformed': true } } },
          'indyscan.txn.data.data.node_ip_text': { type: 'text' },
          'indyscan.txn.data.data.node_port': { type: 'integer' },

          // TX: NODE tx geo information
          'indyscan.txn.data.data.client_ip_geo.location': { type: 'geo_point' },
          'indyscan.txn.data.data.client_ip_geo.eu': { type: 'boolean' },
          'indyscan.txn.data.data.node_ip_geo.location': { type: 'geo_point' },
          'indyscan.txn.data.data.node_ip_geo.eu': { type: 'boolean' },

          // config POOL UPGRADE
          'indyscan.txn.data.schedule.scheduleKey': { type: 'keyword' },
          'indyscan.txn.data.schedule.scheduleTime': { type: 'date', format: "strict_date_optional_time||epoch_millis||yyyy-MM-dd'T'HH:mm:ss.SSSZZ||yyyy-MM-dd'T'HH:mm.SSSZZ", 'ignore_malformed': true },

          // TX: domain AUTHOR_AGREEMENT_AML
          'indyscan.txn.data.aml.at_submission': { type: 'text', analyzer: 'english' },
          'indyscan.txn.data.aml.click_agreement': { type: 'text', analyzer: 'english' },
          'indyscan.txn.data.aml.for_session': { type: 'text', analyzer: 'english' },
          'indyscan.txn.data.aml.on_file': { type: 'text', analyzer: 'english' },
          'indyscan.txn.data.aml.product_eula': { type: 'text', analyzer: 'english' },
          'indyscan.txn.data.aml.service_agreement': { type: 'text', analyzer: 'english' },
          'indyscan.txn.data.aml.wallet_agreement': { type: 'text', analyzer: 'english' },

          // TX: domain AUTHOR_AGREEMENT
          'indyscan.txn.data.text': { type: 'text', analyzer: 'english' }
        }
      }
    }
    logger.info(`${whoami} Setting up mappings for ES Index ${esIndex}!`)
    await esClient.indices.putMapping(coreMappings)
  }

  function _basicTxAnalysis (ledgerTx) {
    if (!ledgerTx || !ledgerTx.txnMetadata || ledgerTx.txnMetadata.seqNo === undefined || ledgerTx.txnMetadata.seqNo === null) {
      throw Error(`Tx failed basic validation. Tx ${JSON.stringify(ledgerTx)}`)
    }
    if (!ledgerTx || !ledgerTx.txn || ledgerTx.txn.type === undefined) {
      throw Error(`Tx failed basic validation. Tx ${JSON.stringify(ledgerTx)}`)
    }
    const { seqNo } = ledgerTx.txnMetadata
    const { type } = ledgerTx.txn
    return { seqNo, type }
  }

  function _basicTransformedTxAnalysis (transformedTx, seqNo, type) {
    if (transformedTx.meta.transformError) {
      logger.error(`${whoami} Transformation for transaction seqNo=${seqNo} failed!` +
        ` Transformation error: ${JSON.stringify(transformedTx.meta.transformError, null, 2)}`)
    }
    if (transformedTx.txn.typeName === 'UNKNOWN') {
      logger.warn(`${whoami} Could not determine typeName for transaction seqno=${seqNo} with type ${type}.`)
    }
    if (transformedTx.subledger.name === 'UNKNOWN') {
      logger.warn(`${whoami} Could not determine subledger for transaction seqno=${seqNo} with type ${type}.`)
    } else if (transformedTx.subledger.name !== subledgerNameUpperCase) {
      throw Error(`${whoami} Won't add transaction to storage. Tx beelongs to ${transformedTx.subledger.name}` +
        ` but this storage is storing tx for subledger '${subledgerNameUpperCase}'.` +
        ` The transaction: '${JSON.stringify(transformedTx)}'.`)
    }
  }

  async function _sendTxToElastic (ledgerTx, transformedTx) {
    await esClient.index({
      id: `${subledgerNameUpperCase}-${transformedTx.txnMetadata.seqNo}`,
      index: esIndex,
      body: {
        original: JSON.stringify(ledgerTx),
        indyscan: transformedTx
      }
    })
  }

  async function _runTransformation (ledgerTx) {
    try {
      return transformTx(ledgerTx)
    } catch (err) {
      logger.error(`${whoami} Transformation critically failed. Transformations are not supposed to throw, but it happened for!`)
      throw Error()
    }
  }

  async function addTx (tx) {
    const { seqNo, type } = _basicTxAnalysis(tx)
    logger.debug(`${whoami} Adding seqno=${seqNo} transaction: ${JSON.stringify(tx, null, 2)}!`)
    const transformed = await _runTransformation(tx)
    _basicTransformedTxAnalysis(transformed, seqNo, type)
    transformed.meta.scanTime = new Date().toISOString()
    await _sendTxToElastic(tx, transformed)
  }

  return {
    addTx
  }
}

module.exports.createStorageWriteEs = createStorageWriteEs
