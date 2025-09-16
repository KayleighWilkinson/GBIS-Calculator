/*****************************************************
 * 0) Cloud Function endpoint 
 *****************************************************/
const CLOUD_RUN_URL = "https://postcode-matcher-919783778467.europe-west2.run.app";

/*****************************************************
 * 1) Static mapping of Substation -> Value (from your list)
 *    Keep the keys EXACTLY as they appear in the uploaded CSV.
 *****************************************************/
const SUBSTATION_VALUES = {
  "Aldreth": 400.4,
  "Barsham": 4260.59,
  "Beresford Avenue": 915.6,
  "Bow": 1634.75,
  "Bramford Diss Thetford": 134.29,
  "Brington": 1269.63,
  "Brockenhurst Mill Hill Total": 341.82,
  "Caister": 1074.30,
  "Chelmsford East Local": 1786.40,
  "Croydon": 1464.96,
  "Feltwell": null,
  "Godmanchester": 1632.40,
  "Guyhirn": 4541.38,
  "Hendon Way": 4439.57,
  "Kenninghall": 1294.05,
  "Kimbolton": 732.48,
  "Kimms Belt": 14088.03,
  "Laxfield": 2636.93,
  "Leysdown": 16230.76,
  "March Primary": 1049.89,
  "North Drive": 1955.66,
  "Reed": 659.23,
  "Ripe": 2197.44,
  "Selwyn Road": 708.06,
  "Sevington Total": 837.76,
  "Smeeth": 6665.57,
  "St Helier": 3104.64,
  "Stickfast Lane": 1904.45,
  "Sutton B": 6206.98,
  "Takeley": 3270.96,
  "Thaxted Local": 659.23,
  "Thorpe Grid 33": 106.26,
  "Tunbridge Wells-Pembury": 1538.21,
  "W. Weybridge": null,
  "Waddesdon": 1294.05,
  "Warehorne Kenardington Tenterden Wittersham": 878.98,
  "West Horndon": 4628.74,
  "White Roding": 1932.84,
  "Willesden Grid": 2457.00,
  "Wittersham": 9448.99,
  "Wrotham": 5211.36
};

/*****************************************************
 * 2) CSV Upload + Parse
 *****************************************************/
let uploadedRows = []; // [{postcode, substation}, ...]

const inputEl = document.getElementById("inputFile");
const processBtn = document.getElementById("processBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusEl = document.getElementById("status");
const tbody = document.querySelector("#results tbody");

inputEl.addEventListener("change", (e) => {
  statusEl.textContent = "";
  tbody.innerHTML = "";
  processBtn.disabled = true;
  downloadBtn.disabled = true;

  const file = e.target.files[0];
  if (!file) return;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      // Normalise headers: expect 'postcode' and 'substation'
      const rows = results.data.map(r => ({
        postcode: (r.postcode || r.Postcode || r.POSTCODE || "").toString().trim(),
        substation: (r.substation || r.Substation || r.SUBSTATION || "").toString().trim()
      })).filter(r => r.postcode && r.substation);

      if (!rows.length) {
        statusEl.textContent = "No valid rows found. Ensure headers are 'postcode' and 'substation'.";
        return;
      }
      uploadedRows = rows;
      processBtn.disabled = false;
      statusEl.textContent = `Loaded ${uploadedRows.length} rows.`;
    }
  });
});

/*****************************************************
 * 3) Call Cloud Function + Merge Results
 *****************************************************/
processBtn.addEventListener("click", async () => {
  statusEl.textContent = "Processing…";
  tbody.innerHTML = "";
  downloadBtn.disabled = true;

  try {
    const postcodes = uploadedRows.map(r => r.postcode);

    // POST to your Cloud Function
    const resp = await fetch(CLOUD_RUN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcodes })
    });

    if (!resp.ok) {
      const msg = await resp.text().catch(() => "");
      throw new Error(`Function HTTP ${resp.status}: ${msg}`);
    }

    const providerRows = await resp.json(); // [{postcode, provider}]
    // Build a normalised map: key = normalised postcode
    const providerMap = {};
    providerRows.forEach(r => {
      const norm = String(r.postcode || "")
        .replace(/\s+/g, "")
        .toUpperCase();
      providerMap[norm] = r.provider || "";
    });

    const out = [];

    uploadedRows.forEach(r => {
      const rawPostcode = r.postcode;
      const substation  = r.substation;
      const norm = rawPostcode.replace(/\s+/g, "").toUpperCase();

      const provider = providerMap[norm] || "— Not Found —";
      const subValueRaw = SUBSTATION_VALUES.hasOwnProperty(substation)
        ? SUBSTATION_VALUES[substation]
        : null;

      // Format substation value (keep "—" if null/undefined)
      const subValue = (subValueRaw === null || typeof subValueRaw === "undefined")
        ? "—"
        : Number(subValueRaw).toLocaleString("en-GB", { maximumFractionDigits: 2 });

      const row = {
        postcode: rawPostcode,
        substation,
        provider,
        substation_value: subValue
      };
      out.push(row);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.postcode}</td>
        <td>${row.substation}</td>
        <td>${row.provider}</td>
        <td>${row.substation_value}</td>
      `;
      tbody.appendChild(tr);
    });

    statusEl.textContent = `Done. ${out.length} rows processed.`;
    downloadBtn.disabled = false;

    // Hook up CSV download of results
    downloadBtn.onclick = () => {
      const csv = Papa.unparse(out, {
        columns: ["postcode", "substation", "provider", "substation_value"]
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "postcode_matches.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

  } catch (err) {
    console.error(err);
    statusEl.textContent = `Error: ${err.message}`;
  }
});