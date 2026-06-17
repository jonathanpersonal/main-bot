/*************************************************************
 * Department Database v2
 * File: 02_PDV2_Sheets.gs
 *************************************************************/

function pdv2Spreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No active spreadsheet found. Use this as a container-bound Apps Script attached to the Google Sheet database.');
  return ss;
}

function pdv2GetSheet_(sheetName) {
  var ss = pdv2Spreadsheet_();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);
  return sh;
}

function pdv2HeadersForSheet_(sheetName) {
  return PDV2.HEADERS[sheetName] || [];
}

function pdv2EnsureSheet_(sheetName) {
  var sh = pdv2GetSheet_(sheetName);
  var headers = pdv2HeadersForSheet_(sheetName);
  if (headers.length) pdv2EnsureHeaders_(sh, headers);
  pdv2FormatSheet_(sh);
  return sh;
}

function pdv2EnsureHeaders_(sh, headers) {
  if (!headers || !headers.length) return;

  var lastCol = Math.max(sh.getLastColumn(), headers.length);
  var current = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(pdv2String_) : [];
  var changed = false;

  if (sh.getLastRow() === 0 || current.join('') === '') {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    changed = true;
  } else {
    headers.forEach(function(header) {
      if (current.indexOf(header) < 0) {
        current.push(header);
        changed = true;
      }
    });
    if (changed) {
      sh.getRange(1, 1, 1, current.length).setValues([current]);
    }
  }

  if (changed) pdv2FormatSheet_(sh);
}

function pdv2FormatSheet_(sh) {
  if (!sh || sh.getLastColumn() < 1) return;
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  try { sh.autoResizeColumns(1, Math.min(sh.getLastColumn(), 12)); } catch (err) {}
}

function pdv2HeaderMap_(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return {};
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  headers.forEach(function(header, index) {
    var h = pdv2String_(header);
    if (h) map[h] = index + 1;
  });
  return map;
}

function pdv2RowToObject_(sh, rowNumber) {
  var map = pdv2HeaderMap_(sh);
  var headers = Object.keys(map).sort(function(a, b) { return map[a] - map[b]; });
  if (rowNumber < 2 || rowNumber > sh.getLastRow()) return null;
  var values = sh.getRange(rowNumber, 1, 1, sh.getLastColumn()).getValues()[0];
  var obj = { __rowNumber: rowNumber };
  headers.forEach(function(header) {
    obj[header] = values[map[header] - 1];
  });
  return obj;
}

function pdv2AppendObject_(sheetName, obj) {
  var sh = pdv2EnsureSheet_(sheetName);
  var map = pdv2HeaderMap_(sh);
  var headers = Object.keys(map).sort(function(a, b) { return map[a] - map[b]; });
  var row = headers.map(function(header) {
    return obj && obj.hasOwnProperty(header) ? obj[header] : '';
  });
  sh.appendRow(row);
  return sh.getLastRow();
}

function pdv2UpdateRowObject_(sheetName, rowNumber, updates) {
  var sh = pdv2EnsureSheet_(sheetName);
  var map = pdv2HeaderMap_(sh);
  Object.keys(updates || {}).forEach(function(header) {
    if (map[header]) sh.getRange(rowNumber, map[header]).setValue(updates[header]);
  });
  return pdv2RowToObject_(sh, rowNumber);
}

function pdv2FindRowByValue_(sheetName, headerName, value) {
  var sh = pdv2EnsureSheet_(sheetName);
  var map = pdv2HeaderMap_(sh);
  var col = map[headerName];
  if (!col) return 0;

  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;

  var needle = pdv2String_(value);
  var values = sh.getRange(2, col, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (pdv2String_(values[i][0]) === needle) return i + 2;
  }
  return 0;
}

function pdv2ListRows_(sheetName, options) {
  options = options || {};
  var sh = pdv2EnsureSheet_(sheetName);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  var map = pdv2HeaderMap_(sh);
  var headers = Object.keys(map).sort(function(a, b) { return map[a] - map[b]; });
  var values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  var rows = values.map(function(row, index) {
    var obj = { __rowNumber: index + 2 };
    headers.forEach(function(header) { obj[header] = row[map[header] - 1]; });
    return obj;
  });

  if (options.whereHeader && options.whereValue !== undefined) {
    rows = rows.filter(function(row) {
      return pdv2String_(row[options.whereHeader]) === pdv2String_(options.whereValue);
    });
  }

  if (options.status) {
    rows = rows.filter(function(row) {
      return pdv2String_(row.Status) === pdv2String_(options.status) || pdv2String_(row['Status']) === pdv2String_(options.status);
    });
  }

  if (options.limit) rows = rows.slice(0, Number(options.limit));
  return rows;
}

function pdv2GetConfigValue_(key, fallback) {
  try {
    var row = pdv2FindRowByValue_(PDV2.SHEETS.SYSTEM_CONFIG, 'Key', key);
    if (!row) return fallback;
    var obj = pdv2RowToObject_(pdv2EnsureSheet_(PDV2.SHEETS.SYSTEM_CONFIG), row);
    var value = obj ? obj.Value : '';
    return value === '' || value === null || value === undefined ? fallback : value;
  } catch (err) {
    return fallback;
  }
}

function pdv2SetConfigValue_(key, value, description) {
  var row = pdv2FindRowByValue_(PDV2.SHEETS.SYSTEM_CONFIG, 'Key', key);
  var obj = {
    'Key': key,
    'Value': value,
    'Description': description || '',
    'Updated At': pdv2Now_()
  };
  if (row) return pdv2UpdateRowObject_(PDV2.SHEETS.SYSTEM_CONFIG, row, obj);
  pdv2AppendObject_(PDV2.SHEETS.SYSTEM_CONFIG, obj);
  return obj;
}
