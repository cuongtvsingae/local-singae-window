const fs = require("fs");
const ExcelJS = require("exceljs");

const TEMPLATE_HEADER_ALIASES = {
  id: ["id", "ma", "code"],
  category: ["category", "danhmuc", "nhom"],
  question: ["question", "cauhoi", "q"],
  answer: ["answer", "traloi", "a"],
  keywords: ["keywords", "keyword", "tukhoa", "tags"],
  conditions: ["conditions", "condition", "dieukien"],
  channel_scope: ["channel_scope", "channelscope", "channel", "kenh"],
  priority: ["priority", "uutien"],
  effective_from: ["effective_from", "hieuluctu", "from_date"],
  effective_to: ["effective_to", "hieulucden", "to_date"],
  status: ["status", "trangthai"],
  source_url: ["source_url", "source", "url"]
};

function normalizeHeaderKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeHeaders(values) {
  return values.map((value, index) => {
    const header = String(value || "").trim();
    return header || `column_${index + 1}`;
  });
}

function resolveTemplateKey(header) {
  const normalized = normalizeHeaderKey(header);
  for (const [canonical, aliases] of Object.entries(TEMPLATE_HEADER_ALIASES)) {
    if (aliases.some((alias) => normalizeHeaderKey(alias) === normalized)) return canonical;
  }
  return null;
}

function normalizeTemplateRecords(records) {
  const input = Array.isArray(records) ? records : [];
  if (!input.length) return [];
  let mappedFields = 0;
  const normalized = input.map((row) => {
    const out = {};
    for (const [key, value] of Object.entries(row || {})) {
      const templateKey = resolveTemplateKey(key);
      if (templateKey) {
        out[templateKey] = value;
        mappedFields += 1;
      } else {
        out[key] = value;
      }
    }
    return out;
  });
  // Use template normalization only when the sheet is actually template-like.
  if (mappedFields < input.length * 2) return records;
  return normalized.map((row, index) => {
    const status = String(row.status || "active").trim().toLowerCase() || "active";
    const priority = Number(row.priority || 3);
    return {
      id: String(row.id || `KB-${index + 1}`).trim(),
      category: String(row.category || "General").trim(),
      question: String(row.question || "").trim(),
      answer: String(row.answer || "").trim(),
      keywords: String(row.keywords || "").trim(),
      conditions: String(row.conditions || "").trim(),
      channel_scope: String(row.channel_scope || "all").trim().toLowerCase() || "all",
      priority: Number.isFinite(priority) ? Math.max(1, Math.min(5, priority)) : 3,
      effective_from: String(row.effective_from || "").trim(),
      effective_to: String(row.effective_to || "").trim(),
      status: status || "active",
      source_url: String(row.source_url || "").trim()
    };
  });
}

function mapValuesToRecords(headers, rows) {
  return rows.reduce((records, row) => {
    const record = {};

    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });

    const hasValue = Object.values(record).some((value) => String(value || "").trim());
    if (hasValue) {
      records.push(record);
    }

    return records;
  }, []);
}

function mapWorksheetToRows(worksheet) {
  const rawRows = [];

  worksheet.eachRow((row, rowNumber) => {
    rawRows.push({
      rowNumber,
      values: row.values.slice(1)
    });
  });

  if (!rawRows.length) {
    return [];
  }

  const headers = normalizeHeaders(rawRows[0].values);
  return normalizeTemplateRecords(
    mapValuesToRecords(
    headers,
    rawRows.slice(1).map((row) => row.values)
    )
  );
}

async function importFromXlsx(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error("Khong tim thay file XLSX.");
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("invalid") || message.includes("corrupt") || message.includes("zip")) {
      throw new Error("File XLSX khong hop le (co the dang chon nham file tam ~$ hoac file bi loi).");
    }
    throw new Error(`Khong the doc file XLSX: ${error?.message || error}`);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  return mapWorksheetToRows(worksheet);
}

async function importAllSheetsFromXlsx(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error("Khong tim thay file XLSX.");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  return workbook.worksheets
    .map((worksheet) => ({
      sheetName: String(worksheet?.name || "Sheet").trim() || "Sheet",
      rows: mapWorksheetToRows(worksheet)
    }))
    .filter((sheet) => Array.isArray(sheet.rows) && sheet.rows.length > 0);
}

function extractSpreadsheetId(sheetUrl) {
  const match = String(sheetUrl).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : sheetUrl;
}

function buildPublicSheetJsonUrl(sheetUrl, sheetName) {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  const baseUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json`;
  return sheetName ? `${baseUrl}&sheet=${encodeURIComponent(sheetName)}` : baseUrl;
}

function parseGoogleVisualizationResponse(rawText) {
  const start = rawText.indexOf("(");
  const end = rawText.lastIndexOf(")");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Du lieu Google Sheet JSON khong dung dinh dang.");
  }

  const jsonText = rawText.slice(start + 1, end);
  return JSON.parse(jsonText);
}

function extractCellValue(cell) {
  if (!cell) {
    return "";
  }

  if (cell.f !== null && cell.f !== undefined) {
    return String(cell.f).trim();
  }

  if (cell.v === null || cell.v === undefined) {
    return "";
  }

  return String(cell.v).trim();
}

function mapGoogleTableToRows(table) {
  const headers = normalizeHeaders(
    (table.cols || []).map((column, index) => column.label || column.id || `column_${index + 1}`)
  );

  const values = (table.rows || []).map((row) =>
    (row.c || []).map((cell) => extractCellValue(cell))
  );

  return normalizeTemplateRecords(mapValuesToRecords(headers, values));
}

async function importPublicGoogleSheet(sheetUrl, sheetName) {
  const jsonUrl = buildPublicSheetJsonUrl(sheetUrl, sheetName);
  const response = await fetch(jsonUrl);

  if (!response.ok) {
    throw new Error("Khong the doc Google Sheet public.");
  }

  const rawText = await response.text();
  const payload = parseGoogleVisualizationResponse(rawText);
  return mapGoogleTableToRows(payload.table || {});
}

async function importFromGoogleSheet(sheetUrl, sheetName) {
  return importPublicGoogleSheet(sheetUrl, sheetName);
}

module.exports = {
  importAllSheetsFromXlsx,
  importFromGoogleSheet,
  importFromXlsx
};






