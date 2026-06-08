const serverConfig = require('../config/serverConfig');

function getServerConfig() {
  return serverConfig;
}

function validateServerConfig() {
  const requiredFields = [
    'departmentName',
    'guildId'
  ];

  const missingFields = [];

  for (const field of requiredFields) {
    if (!serverConfig[field]) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    console.warn(
      `Server config warning: missing required field(s): ${missingFields.join(', ')}`
    );
  }

  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}

module.exports = {
  getServerConfig,
  validateServerConfig
};