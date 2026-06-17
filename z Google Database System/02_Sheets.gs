function gsv2Spreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No active spreadsheet found. Run this script from a bound spreadsheet.');
  return ss;
}

function gsv2Sheet_(sheetName) {
  const sheet = gsv2Spreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error('Missing required sheet: ' + sheetName + '. Run gsv2InstallOrRepairSystem().');
  return sheet;
}

function gsv2EnsureSheet_(sheetName, headers) {
  const ss = gsv2Spreadsheet_();
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  gsv2EnsureHeaders_(sheet, headers);
  return sheet;
}

function gsv2EnsureHeaders_(sheet, headers) {
  const lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  const current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const existing = current.map(String).map((v) => v.trim()).filter(Boolean);
  const merged = existing.slice();

  headers.forEach((header) => {
    if (merged.indexOf(header) === -1) merged.push(header);
  });

  sheet.getRange(1, 1, 1, merged.length).setValues([merged]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, merged.length).setFontWeight('bold');

  if (sheet.getLastColumn() < merged.length) {
    sheet.insertColumnsAfter(sheet.getLastColumn(), merged.length - sheet.getLastColumn());
  }
}

function gsv2HeadersForSheet_(sheetName) {
  const headers = GSV2.headers[sheetName];
  if (!headers) throw new Error('No configured headers for sheet: ' + sheetName);
  return headers;
}

function gsv2GetHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (!lastColumn) return [];
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String).map((v) => v.trim());
}

function gsv2RowToObject_(headers, row) {
  const obj = {};
  headers.forEach((header, index) => {
    if (!header) return;
    obj[header] = row[index] === undefined ? '' : row[index];
  });
  return obj;
}

function gsv2AppendObject_(sheetName, data) {
  const sheet = gsv2EnsureSheet_(sheetName, gsv2HeadersForSheet_(sheetName));
  const headers = gsv2GetHeaders_(sheet);
  const row = headers.map((header) => data[header] === undefined ? '' : data[header]);
  sheet.appendRow(row);
  return data;
}

function gsv2FindFirstByField_(sheetName, fieldName, expectedValue) {
  const sheet = gsv2Sheet_(sheetName);
  const headers = gsv2GetHeaders_(sheet);
  const fieldIndex = headers.indexOf(fieldName);

  if (fieldIndex === -1) throw new Error('Field not found on ' + sheetName + ': ' + fieldName);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][fieldIndex]) === String(expectedValue)) {
      return {
        rowNumber: i + 2,
        object: gsv2RowToObject_(headers, values[i])
      };
    }
  }

  return null;
}

function gsv2FindAllByField_(sheetName, fieldName, expectedValue) {
  const sheet = gsv2Sheet_(sheetName);
  const headers = gsv2GetHeaders_(sheet);
  const fieldIndex = headers.indexOf(fieldName);

  if (fieldIndex === -1) throw new Error('Field not found on ' + sheetName + ': ' + fieldName);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const matches = [];

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][fieldIndex]) === String(expectedValue)) {
      matches.push({
        rowNumber: i + 2,
        object: gsv2RowToObject_(headers, values[i])
      });
    }
  }

  return matches;
}

function gsv2UpdateRowObject_(sheetName, rowNumber, patch) {
  const sheet = gsv2Sheet_(sheetName);
  const headers = gsv2GetHeaders_(sheet);
  const range = sheet.getRange(rowNumber, 1, 1, headers.length);
  const row = range.getValues()[0];
  const current = gsv2RowToObject_(headers, row);
  const updated = Object.assign({}, current, patch || {});
  const nextRow = headers.map((header) => updated[header] === undefined ? '' : updated[header]);
  range.setValues([nextRow]);
  return updated;
}

function gsv2ReadAllObjects_(sheetName) {
  const sheet = gsv2Sheet_(sheetName);
  const headers = gsv2GetHeaders_(sheet);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, headers.length)
    .getValues()
    .map((row, index) => ({
      rowNumber: index + 2,
      object: gsv2RowToObject_(headers, row)
    }));
}
