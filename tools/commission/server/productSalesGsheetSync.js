const axios = require('axios');

function normalizeNameKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseMoneyLike(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const raw = String(v ?? '').trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[.,]/g, '').replace(/[^0-9\-]/g, '');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** GAS Web App: rows[] { product, user, amount } → totalsByUser / totalsByProduct (+ counts). */
function aggregateProductSalesFromRows(rows) {
  const totalsByUser = {};
  const totalsByProduct = {};
  if (!Array.isArray(rows)) return { totalsByUser, totalsByProduct };
  for (const r of rows) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    const product = String(r.product ?? r.Product ?? '').trim();
    const user = String(r.user ?? r.User ?? r.seller ?? r.Seller ?? '').trim();
    const amount = Math.round(parseMoneyLike(r.amount ?? r.Amount));
    if (!product || !user || !(amount > 0)) continue;
    const nk = normalizeNameKey(user);
    if (!totalsByUser[nk]) totalsByUser[nk] = { displayName: user, products: {}, counts: {} };
    totalsByUser[nk].products[product] = Math.round((totalsByUser[nk].products[product] || 0) + amount);
    totalsByUser[nk].counts[product] = Math.round((totalsByUser[nk].counts[product] || 0) + 1);
    totalsByProduct[product] = Math.round((totalsByProduct[product] || 0) + amount);
  }
  return { totalsByUser, totalsByProduct };
}

/**
 * Đăng ký POST /admin/commission-settings/product-sales-sync-from-gsheet trên router đã mount /api.
 * Settings vẫn lưu SQLite user-admin (getSetting/setSetting) — chỉ tách code nghiệp vụ sang tool commission.
 */
function mountProductSalesGsheetSyncRoute(router, { getSetting, setSetting }) {
  router.post('/admin/commission-settings/product-sales-sync-from-gsheet', async (req, res) => {
    try {
      let url = String(req.body?.url || '').trim();
      if (!url) {
        const saved = await getSetting('commission_product_sales_gsheet_url', '');
        url = String(saved || '').trim();
      }
      if (!url) {
        return res.status(200).json({ ok: true, skipped: true, reason: 'no_gsheet_url' });
      }
      if (!/^https?:\/\//i.test(url)) return res.status(400).json({ ok: false, error: 'Missing or invalid url' });
      const r = await axios.get(url, { timeout: 20000, validateStatus: () => true });
      if (r.status !== 200 || r.data === undefined || r.data === null) {
        return res.status(502).json({ ok: false, error: 'Fetch failed', status: r.status });
      }
      const contentType = String(r.headers['content-type'] || '');
      if (typeof r.data === 'string' && (/^\s*</.test(r.data) || /text\/html/i.test(contentType))) {
        return res.status(200).json({
          ok: false,
          skipped: true,
          error:
            'Web App trả về HTML (thường là đăng nhập Google). Hãy deploy với quyền "Anyone" hoặc URL /exec truy cập được từ server.'
        });
      }
      let data = r.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data.trim());
        } catch {
          return res.status(400).json({ ok: false, error: 'Response is not valid JSON' });
        }
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return res.status(400).json({ ok: false, error: 'Unsupported GSheet payload format' });
      }
      if (data.ok === false) {
        return res.status(502).json({
          ok: false,
          error: String(data.error || 'GSheet Web App returned ok: false'),
          details: data
        });
      }
      let totalsByUser = {};
      let totalsByProduct = {};

      const tbu = data.totalsByUser;
      const hasStructuredTotals = tbu != null && typeof tbu === 'object' && !Array.isArray(tbu);
      if (hasStructuredTotals) {
        totalsByUser = tbu;
        const tbp = data.totalsByProduct;
        totalsByProduct = tbp != null && typeof tbp === 'object' && !Array.isArray(tbp) ? tbp : {};
      } else if (Array.isArray(data.rows) && data.rows.length > 0) {
        const agg = aggregateProductSalesFromRows(data.rows);
        totalsByUser = agg.totalsByUser;
        totalsByProduct = agg.totalsByProduct;
      } else {
        const rows2D = Array.isArray(data?.values)
          ? data.values
          : Array.isArray(data) && Array.isArray(data[0])
            ? data
            : null;
        if (!rows2D) {
          return res.status(400).json({
            ok: false,
            error: 'Unsupported GSheet payload format',
            hint:
              'Cần JSON có totalsByUser+totalsByProduct, hoặc rows[{product,user,amount}], hoặc mảng 2D values/cột F,K,L.'
          });
        }
        const startRow = 1;
        for (let i = startRow; i < rows2D.length; i++) {
          const row = rows2D[i] || [];
          const product = String(row[5] || '').trim();
          const user = String(row[10] || '').trim();
          const amount = Number(String(row[11] || '0').replace(/[^\d\-]/g, '')) || 0;
          if (!product || !user || !(amount > 0)) continue;
          const nk = normalizeNameKey(user);
          if (!totalsByUser[nk]) totalsByUser[nk] = { displayName: user, products: {}, counts: {} };
          totalsByUser[nk].products[product] = Math.round((totalsByUser[nk].products[product] || 0) + amount);
          totalsByUser[nk].counts[product] = Math.round((totalsByUser[nk].counts[product] || 0) + 1);
          totalsByProduct[product] = Math.round((totalsByProduct[product] || 0) + amount);
        }
      }

      const byUser = {};
      Object.keys(totalsByUser).forEach((nk) => {
        const u = totalsByUser[nk] || {};
        const prods = u.products || {};
        const counts = u.counts || {};
        const mouthwash = (prods['NƯỚC SÚC MIỆNG SINGAE'] || 0) + (prods['NƯỚC SÚC MIỆNG'] || 0);
        const mouthwashCount = (counts['NƯỚC SÚC MIỆNG SINGAE'] || 0) + (counts['NƯỚC SÚC MIỆNG'] || 0);
        const waterflosser = prods['MÁY TĂM NƯỚC PROCARE KHD13'] || 0;
        const waterflosserCount = counts['MÁY TĂM NƯỚC PROCARE KHD13'] || 0;
        const dental = prods['DENTAL CARE'] || 0;
        const dentalCount = counts['DENTAL CARE'] || 0;
        byUser[nk] = {
          displayName: u.displayName || nk,
          products: prods,
          counts,
          mapped: {
            mouthwash: { amount: Math.round(mouthwash), count: mouthwashCount },
            waterflosser: { amount: Math.round(waterflosser), count: waterflosserCount },
            dentalCare: { amount: Math.round(dental), count: dentalCount }
          }
        };
      });

      const payload = {
        uploadedAt: new Date().toISOString(),
        source: 'gsheet',
        sheetName: String(data?.sheet || ''),
        parsedRows: Array.isArray(data?.rows) ? data.rows.length : 0,
        columns: data?.columns || {},
        totalsByUser,
        totalsByProduct,
        byUser
      };
      await setSetting('commission_product_sales_v1', JSON.stringify(payload));
      if (req.body?.url) {
        await setSetting('commission_product_sales_gsheet_url', String(req.body.url));
      }
      return res.json({
        ok: true,
        summary: {
          parsedRows: payload.parsedRows,
          users: Object.keys(totalsByUser).length,
          products: Object.keys(totalsByProduct).length
        }
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });
}

module.exports = { mountProductSalesGsheetSyncRoute, aggregateProductSalesFromRows };
