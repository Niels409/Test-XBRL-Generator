/* Azure Functions (Node.js v4 programming model)
 *
 * POST /api/generate   body: { "fileName": "tests.xlsx", "contentBase64": "<base64 of the .xlsx>" }
 *   -> 200 { summary, files: [{ name, contentBase64, valid, deviations, warnings, caseId, processId }], failed: [...] }
 * GET  /api/template   -> 200 { name, contentBase64 }  (the Excel template)
 */
'use strict';
const { app } = require('@azure/functions');
const { generateFromXlsx, templateBase64 } = require('../../lib.js');

app.http('generate', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    try {
      const body = await request.json();
      if (!body || !body.contentBase64) return { status: 400, jsonBody: { error: 'Send { fileName, contentBase64 } with the .xlsx as base64.' } };
      const maxRows = parseInt(process.env.MAX_ROWS || '250', 10);
      const result = await generateFromXlsx(Buffer.from(body.contentBase64, 'base64'), { maxRows });
      if (result.tooMany) return { status: 413, jsonBody: { error: `The Excel file has ${result.tooMany} tests; at most ${maxRows} per call (the response would become too large). Split the file or raise the MAX_ROWS app setting.` } };
      return {
        status: 200,
        jsonBody: {
          summary: result.summary,
          failed: result.failed,
          files: result.files.map(f => ({
            name: f.name, contentBase64: Buffer.from(f.xml, 'utf8').toString('base64'),
            valid: f.valid, deviations: f.deviations, warnings: f.warnings,
            dataProduct: f.dataProduct, caseId: f.caseId, processId: f.processId,
          })),
        },
      };
    } catch (e) {
      context.error(e);
      return { status: 400, jsonBody: { error: e.message || String(e) } };
    }
  },
});

app.http('template', {
  methods: ['GET'],
  authLevel: 'function',
  handler: async () => ({ status: 200, jsonBody: { name: 'VT17 test scenarios template.xlsx', contentBase64: templateBase64() } }),
});
