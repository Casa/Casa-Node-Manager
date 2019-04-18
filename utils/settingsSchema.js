const Validator = require('jsonschema').Validator;

const settingsSchema = {
  type: 'object',
  properties: {
    bitcoind: {$ref: '/bitcoind'},
    lnd: {$ref: '/lnd'}
  },
  required: [
    'bitcoind',
    'lnd',
  ],
  additionalProperties: false

};

const bitcoindSchema = {
  id: '/bitcoind',
  type: 'object',
  properties: {
    bitcoinNetwork: {$ref: '/networks'},
    bitcoindListen: {type: 'boolean'},
    bitcoindPort: {
      type: 'integer',
      minimum: 0,
      maximum: 65535,
    },
    rpcPassword: {type: 'string'},
    rpcUser: {type: 'string'},
    bitcoindTor: {type: 'boolean'},
    torOnly: {type: 'boolean'},
  },
  required: ['bitcoinNetwork', 'bitcoindListen'],
  additionalProperties: false
};

const lndSchema = {
  id: '/lnd',
  type: 'object',
  properties: {
    backend: {type: 'string', enum: ['bitcoind']},
    chain: {type: 'string', enum: ['bitcoin']},
    lndNetwork: {$ref: '/networks'},
    lndNodeAlias: {
      type: 'string',
      maxLength: 32,
    },
    autopilot: {type: 'boolean'},
    maxChannels: {
      type: 'integer',
      minimum: 0,
    },
    maxChanSize: {
      type: 'integer',
      maximum: 16777216,
    },
    externalIP: {
      type: 'string'
    },
    lndTor: {type: 'boolean'},
  },
  oneOf: [
    {
      properties: {autopilot: {enum: [true]}},
      required: ['maxChannels', 'maxChanSize'],
    },
    {
      properties: {autopilot: {enum: [false]}},
      required: [],
    },
  ],
  required: ['backend', 'chain', 'lndNetwork', 'autopilot'],
  additionalProperties: false
};

const availableNetworks = {
  id: '/networks',
  type: 'string',
  enum: ['testnet', 'mainnet']
};

const sparseSettingsSchema = {
  type: 'object',
  properties: {
    bitcoind: {$ref: '/sparseBitcoind'},
    lnd: {$ref: '/sparseLnd'}
  },
  required: [
    'bitcoind',
    'lnd',
  ],
  additionalProperties: false
};

const sparseBitcoindSchema = {
  id: '/sparseBitcoind',
  type: 'object',
  properties: {
    bitcoinNetwork: {$ref: '/networks'},
    bitcoindListen: {type: 'boolean'},
    bitcoindPort: {
      type: 'integer',
      minimum: 0,
      maximum: 65535,
    },
    rpcPassword: {type: 'string'},
    rpcUser: {type: 'string'},
    bitcoindTor: {type: 'boolean'},
    torOnly: {type: 'boolean'},
  },
  required: [],
  additionalProperties: false
};

const sparseLndSchema = {
  id: '/sparseLnd',
  type: 'object',
  properties: {
    lndNetwork: {$ref: '/networks'},
    lndNodeAlias: {
      type: 'string',
      maxLength: 32,
    },
    autopilot: {type: 'boolean'},
    maxChannels: {
      type: 'integer',
      minimum: 0,
      maximum: 40,
    },
    maxChanSize: {
      type: 'integer',
      maximum: 16777216,
    },
    externalIP: {
      type: 'string'
    },
    lndTor: {type: 'boolean'},
  },
  required: [],
  additionalProperties: false
};

function validateSettingsSchema(data) {
  var validator = new Validator();
  validator.addSchema(availableNetworks);
  validator.addSchema(lndSchema);
  validator.addSchema(bitcoindSchema);

  return validator.validate(data, settingsSchema);
}

function validateSparseSettingsSchema(data) { // eslint-disable-line id-length
  var validator = new Validator();
  validator.addSchema(availableNetworks);
  validator.addSchema(sparseLndSchema);
  validator.addSchema(sparseBitcoindSchema);

  return validator.validate(data, sparseSettingsSchema);
}

module.exports = {
  validateSettingsSchema,
  validateSparseSettingsSchema, // eslint-disable-line id-length
};
