const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'z Google Database System');
const files = fs.readdirSync(root).filter((file) => {
  const fullPath = path.join(root, file);
  if (!fs.statSync(fullPath).isFile()) return false;
  if (file === 'appsscript.json') return false;
  if (file.toLowerCase().endsWith('.md')) return false;
  return true;
});

const contents = files.map((file) => ({
  file,
  text: fs.readFileSync(path.join(root, file), 'utf8')
}));

function findFunction(name) {
  return contents
    .filter(({ text }) => new RegExp(`function\\s+${name}\\s*\\(`).test(text))
    .map(({ file }) => file);
}

const doGetFiles = findFunction('doGet');
const doPostFiles = findFunction('doPost');
const routeFiles = findFunction('pdv2RouteRequest_');

const errors = [];

if (doGetFiles.length !== 1) {
  errors.push(`Expected exactly one doGet function, found ${doGetFiles.length}: ${doGetFiles.join(', ') || 'none'}`);
}

if (doPostFiles.length !== 1) {
  errors.push(`Expected exactly one doPost function, found ${doPostFiles.length}: ${doPostFiles.join(', ') || 'none'}`);
}

if (routeFiles.length !== 1) {
  errors.push(`Expected exactly one pdv2RouteRequest_ function, found ${routeFiles.length}: ${routeFiles.join(', ') || 'none'}`);
}

if (!doPostFiles.includes('13_PDV2_WebApp')) {
  errors.push(`doPost must live in 13_PDV2_WebApp for the import/deploy checklist. Found: ${doPostFiles.join(', ') || 'none'}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('Google Apps Script web app entrypoint verified: doGet/doPost/pdv2RouteRequest_ are present in 13_PDV2_WebApp.');
