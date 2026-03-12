// ================================================================
// INVENTARIO QUIRÓFANO IPN — Apps Script FINAL
// Instalación:
// 1. Google Sheet → Extensiones → Apps Script
// 2. Borrá todo y pegá este código
// 3. Ctrl+S para guardar
// 4. Implementar → Nueva implementación
//    Tipo: Aplicación web | Ejecutar como: Yo | Acceso: Cualquiera
// 5. Copiá la URL nueva al HTML
// ================================================================

const SHEET_NAME    = 'Inventario';
const COMPRAS_SHEET = 'Lista de Compras';

function doGet(e) {
  const params   = e.parameter || {};
  const action   = params.action   || 'read';
  const callback = params.callback || '';
  const data     = params.data     || '{}';

  let result;
  try {
    if (action === 'write') {
      result = writeStock(JSON.parse(data));
    } else {
      result = readStock();
    }
  } catch(err) {
    result = { success: false, error: err.message };
  }

  // JSONP (para cargar datos)
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  // Popup de guardado — primero escribe, DESPUÉS muestra HTML
  const ok = result.success !== false;
  const html = '<!DOCTYPE html><html><head>'
    + '<style>*{margin:0;padding:0;box-sizing:border-box}'
    + 'body{font-family:sans-serif;background:#1B4F9B;display:flex;'
    + 'align-items:center;justify-content:center;height:100vh;color:#fff}'
    + '.box{background:rgba(255,255,255,.15);border-radius:16px;'
    + 'padding:2rem 3rem;text-align:center;max-width:320px}'
    + 'h2{margin:.6rem 0;font-size:1.15rem}'
    + '.sub{font-size:.82rem;opacity:.75;margin-top:.3rem}'
    + '</style></head><body><div class="box">'
    + (ok
      ? '<div style="font-size:3rem">✅</div>'
        + '<h2>Guardado en Google Sheets</h2>'
        + '<p class="sub">' + (result.guardados||0) + ' productos guardados<br>Esta ventana se cierra sola...</p>'
      : '<div style="font-size:3rem">❌</div>'
        + '<h2>Error al guardar</h2>'
        + '<p class="sub">' + (result.error||'Error desconocido') + '</p>')
    + '</div>'
    + '<script>setTimeout(function(){window.close();},2000);<\/script>'
    + '</body></html>';

  return HtmlService.createHtmlOutput(html).setTitle('IPN Inventario');
}

function doPost(e) {
  return doGet(e);
}

// ----------------------------------------------------------------
function readStock() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.getSheets()[0]; // usar primera hoja si no existe "Inventario"
  if (!sheet || sheet.getLastRow() < 2) return { success: true, stock: {} };

  const data  = sheet.getDataRange().getValues();
  const stock = {};
  for (let i = 1; i < data.length; i++) {
    const id  = String(data[i][0]);
    const val = data[i][8];
    if (id && val !== '' && val !== null && val !== 'S/D') {
      const n = parseInt(val);
      if (!isNaN(n)) stock[id] = n;
    }
  }
  return { success: true, stock: stock };
}

// ----------------------------------------------------------------
function writeStock(stockObj) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Archivar hoja anterior con fecha antes de sobreescribir
  const fechaArchivo = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm');
  const existente = ss.getSheetByName(SHEET_NAME);
  if (existente && existente.getLastRow() > 1) {
    // Duplicar la hoja actual como historial
    const copia = existente.copyTo(ss);
    copia.setName('Hist ' + fechaArchivo);
    // Mover historial al final
    ss.moveActiveSheet(ss.getSheets().length);
  }

  // Buscar o crear hoja "Inventario"
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheets()[0];
    try { sheet.setName(SHEET_NAME); } catch(e) {}
  }
  // Mover "Inventario" a la primera posición
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(1);
  sheet.clearContents();
  sheet.clearFormats();

  const headers = ['ID','NOMBRE','UdM','INV. MÍNIMO','MARCA','PROVEEDOR','PRECIO (Gs.)','TIPO','STOCK ACTUAL','DIFERENCIA'];
  const hRange  = sheet.getRange(1, 1, 1, headers.length);
  hRange.setValues([headers])
    .setBackground('#1B4F9B').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center');
  sheet.setRowHeight(1, 30);
  sheet.setFrozenRows(1);

  const PRODUCTOS = getProductos();
  const rows = PRODUCTOS.map(p => {
    const [id, nombre, udm, inv_sis, marca, proveedor, precio, tipo] = p;
    const sv   = (stockObj[String(id)] !== undefined) ? stockObj[String(id)] : '';
    const diff = (sv !== '') ? (sv - inv_sis) : '';
    return [id, nombre, udm, inv_sis, marca, proveedor, precio, tipo, sv, diff];
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

    for (let i = 0; i < rows.length; i++) {
      const r   = i + 2;
      const bg  = (i % 2 === 0) ? '#FFFFFF' : '#EEF4FB';
      sheet.getRange(r, 1, 1, headers.length).setBackground(bg).setFontSize(9);

      const sv  = rows[i][8];
      const inv = rows[i][3];
      const sc  = sheet.getRange(r, 9);
      if (sv === '')     { sc.setBackground('#F5F5F5').setFontColor('#9E9E9E'); sc.setValue('S/D'); }
      else if (sv === 0) { sc.setBackground('#FFCDD2').setFontColor('#B71C1C').setFontWeight('bold'); }
      else if (sv <= 3)  { sc.setBackground('#FFF9C4').setFontColor('#F57F17').setFontWeight('bold'); }
      else if (sv < inv) { sc.setBackground('#FFE0B2').setFontColor('#E65100'); }
      else               { sc.setBackground('#C8E6C9').setFontColor('#1B5E20'); }

      const dv = rows[i][9];
      const dc = sheet.getRange(r, 10);
      if (dv !== '' && dv < 0)  dc.setFontColor('#B71C1C').setFontWeight('bold');
      else if (dv !== '' && dv >= 0) dc.setFontColor('#1B5E20');
    }
    sheet.getRange(2, 7, rows.length, 1).setNumberFormat('#,##0');
  }

  sheet.autoResizeColumns(1, headers.length);
  generarHojaCompras(ss, rows);

  return { success: true, guardados: Object.keys(stockObj).length };
}

// ----------------------------------------------------------------
function generarHojaCompras(ss, rows) {
  // Archivar Lista de Compras anterior
  const comprasExistente = ss.getSheetByName(COMPRAS_SHEET);
  if (comprasExistente && comprasExistente.getLastRow() > 2) {
    const copiaC = comprasExistente.copyTo(ss);
    copiaC.setName('Compras ' + fechaArchivo);
    ss.moveActiveSheet(ss.getSheets().length);
  }

  let sheet = ss.getSheetByName(COMPRAS_SHEET);
  if (!sheet) sheet = ss.insertSheet(COMPRAS_SHEET);
  sheet.clearContents();
  sheet.clearFormats();

  const fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

  sheet.getRange(1, 1, 1, 9).merge()
    .setValue('LISTA DE COMPRAS — QUIRÓFANO IPN   |   ' + fecha)
    .setBackground('#C8102E').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(13)
    .setHorizontalAlignment('center');
  sheet.setRowHeight(1, 38);

  const headers = ['PRODUCTO','TIPO','INV. MÍNIMO','STOCK ACTUAL','A COMPRAR','PROVEEDOR','MARCA','PRECIO UNIT. (Gs.)','TOTAL (Gs.)'];
  sheet.getRange(2, 1, 1, 9).setValues([headers])
    .setBackground('#8B0000').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(9)
    .setHorizontalAlignment('center');
  sheet.setFrozenRows(2);

  const aComprar = rows.filter(r => r[8] !== '' && r[8] !== 'S/D' && parseInt(r[8]) < parseInt(r[3]));

  if (aComprar.length === 0) {
    sheet.getRange(3, 1, 1, 9).merge()
      .setValue('Todo el stock esta en orden.')
      .setFontColor('#2E7D32').setFontWeight('bold')
      .setHorizontalAlignment('center').setFontSize(11);
    return;
  }

  const byProv = {};
  aComprar.forEach(r => {
    const prov = r[5] || 'SIN PROVEEDOR';
    if (!byProv[prov]) byProv[prov] = [];
    byProv[prov].push(r);
  });

  let currentRow = 3;
  let totalGral  = 0;
  let totalItems = 0;

  Object.entries(byProv).sort().forEach(([prov, prods]) => {
    sheet.getRange(currentRow, 1, 1, 9).merge()
      .setValue('  ' + prov)
      .setBackground('#1B4F9B').setFontColor('#FFFFFF')
      .setFontWeight('bold').setFontSize(9);
    sheet.setRowHeight(currentRow, 22);
    currentRow++;

    prods.forEach((r, i) => {
      const sv      = parseInt(r[8]);
      const invMin  = parseInt(r[3]);
      const necesita = invMin - sv;
      const precio  = parseFloat(r[6]) || 0;
      const total   = necesita * precio;
      totalGral    += total;
      totalItems++;

      const urgente = sv === 0;
      const bg = urgente ? '#FFEBEE' : (i % 2 === 0 ? '#FFFFFF' : '#FFF8F8');
      const rowData = [r[1], r[7], invMin, sv, necesita, r[5], r[4], precio, total];
      sheet.getRange(currentRow, 1, 1, 9).setValues([rowData]).setBackground(bg).setFontSize(9);
      if (urgente) {
        sheet.getRange(currentRow, 1).setFontColor('#C62828').setFontWeight('bold');
        sheet.getRange(currentRow, 5).setFontColor('#C62828').setFontWeight('bold');
      } else {
        sheet.getRange(currentRow, 5).setFontColor('#E65100').setFontWeight('bold');
      }
      sheet.getRange(currentRow, 8).setNumberFormat('#,##0');
      sheet.getRange(currentRow, 9).setNumberFormat('#,##0');
      currentRow++;
    });
  });

  sheet.getRange(currentRow, 1, 1, 9)
    .setValues([['TOTAL ESTIMADO', '', '', '', totalItems + ' items', '', '', '', totalGral]])
    .setBackground('#0D1B2A').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(10);
  sheet.getRange(currentRow, 9).setNumberFormat('#,##0').setFontColor('#FFC72C').setFontSize(12);
  sheet.autoResizeColumns(1, 9);
}

// ----------------------------------------------------------------
function getProductos() {
  return [
    [1,"ALGILASCA INY.","UNIDAD",50,"ALGILASCA","LASCA",3524,"MED"],
    [2,"ATRACURIO BESILATO 10MG","UNIDAD",5,"ATRACURIO","FARMACIA INFANTIL",40000,"MED"],
    [3,"BETACORTEN HIDROCORTISONA","UNIDAD",3,"HIDROCORTISONA","FARMACIA INFANTIL",30870,"MED"],
    [4,"CEFRAZOL 1G FC/AMP C/SOL. INY.","FRASCO",15,"CEFRAZOL","LASCA",14827,"MED"],
    [5,"CLANZOL LIOF + SOLV","AMPOLLA",20,"CLANZOL","LASCA",42019,"MED"],
    [6,"COMPAZ SOL. INY.","UNIDAD",5,"COMPAZ","FARMACIA INFANTIL",8927,"MED"],
    [7,"CONTRO NATURE X 6","UNIDAD",1,"CONTROL","FARMACIA INFANTIL",14160,"MED"],
    [8,"DOLOSTOP 60 MG INY. X 1 AMP 2 ML","UNIDAD",40,"DOLOSTOP","LASCA",18528,"MED"],
    [9,"DORMICUM","UNIDAD",5,"DORMICUM","FARMACIA INFANTIL",45229,"MED"],
    [10,"DORMIRE 15 MG SOL. INY","UNIDAD",3,"DORMIRE","FARMACIA INFANTIL",88099,"MED"],
    [11,"DOXATAR 2ML","UNIDAD",5,"DOXATAR","FARMACIA INFANTIL",23856,"MED"],
    [12,"FAMODINA SOL. INY.","UNIDAD",4,"FAMODINA","FARMACIA INFANTIL",87696,"MED"],
    [13,"FENTANEST SOL. IN","UNIDAD",2,"FENTANEST","FARMACIA INFANTIL",27879,"MED"],
    [14,"GENTAL CREMA CAJA X 20 G","UNIDAD",15,"GENTAL BETA","LASCA",17734,"MED"],
    [15,"IOP SOL. FCO. X 100 ML","UNIDAD",5,"IOP","FARMACIA INFANTIL",29568,"MED"],
    [16,"IOP SOL. X 1000ML","UNIDAD",1,"IOP","FARMACIA INFANTIL",141568,"MED"],
    [17,"IRUXOL POMADA","UNIDAD",5,"IRUXOL","FARMACIA INFANTIL",50895,"MED"],
    [18,"KETAMIN SOL. INY.","UNIDAD",5,"KETAMIN","FARMACIA INFANTIL",57850,"MED"],
    [19,"LEVOMIN SOL. INY.","UNIDAD",27,"LEVOMIN","FARMACIA INFANTIL",2467,"MED"],
    [20,"LUNG AEROSOL P/INH","AMPOLLA",1,"LUNG","FARMACIA INFANTIL",35235,"MED"],
    [21,"MEPERDOL SOL. INY.","UNIDAD",5,"MEPERDOL","FARMACIA INFANTIL",27170,"MED"],
    [22,"NAFAZILINA NORMAL","UNIDAD",5,"NAFAZOLINA","FARMACIA INFANTIL",25143,"MED"],
    [23,"NEOCAINA PESADA 4 ML","UNIDAD",2,"NEOCAINA PESADA","DIPROAN",49550,"MED"],
    [24,"NOVABUPI X 4 ML","UNIDAD",5,"NOVABUPI","DIPROAN",21971,"MED"],
    [25,"NOVOSPORINA UNGUENTO","UNIDAD",10,"NOVOSPORINA","FARMACIA INFANTIL",34713,"MED"],
    [26,"ONDATRON 4MG","UNIDAD",40,"ONDATRON","LASCA",15984,"MED"],
    [27,"PLUSCORT 500 SOL. INY.","UNIDAD",2,"PLUSCORT","FARMACIA INFANTIL",72864,"MED"],
    [28,"PLUSCOT 500 SOL. INY.","UNIDAD",5,"PLUSCORT","FARMACIA INFANTIL",72932,"MED"],
    [29,"PROPOVAN X 20ML","UNIDAD",10,"PROPOVAN","DIPROAN",42525,"MED"],
    [30,"QUIMFADOL SOL. INY.","UNIDAD",5,"QUIMFADOL","FARMACIA INFANTIL",11310,"MED"],
    [31,"RAPIFEN INY. CAJA 5 AMP X 2 ML","UNIDAD",5,"RAPIFEN","FARMACIA INFANTIL",27252,"MED"],
    [32,"REMIFAS","UNIDAD",1,"REMIFAS","FARMACIA INFANTIL",65250,"MED"],
    [33,"REMIFAS 2 MG","UNIDAD",1,"REMIFAS","FARMACIA INFANTIL",326250,"MED"],
    [34,"REMIFAS CRISTALIA 2 MG","UNIDAD",5,"REMIFAS","FARMACIA INFANTIL",65250,"MED"],
    [35,"ROPI 7.5 MG/ML","UNIDAD",5,"ROPI","DIPROAN",55950,"MED"],
    [36,"SEVOCRIS X 250 ML","UNIDAD",1,"SEVOCRIS","DIPROAN",1608370,"MED"],
    [37,"SUERO GLUCOSADO 100 ML","UNIDAD",5,"—","SUMED",17000,"MED"],
    [38,"SUERO RINGER 500 ML","AMPOLLA",25,"—","SUMED",11000,"MED"],
    [39,"SUERO FISIOLOGICO 500 ML","UNIDAD",10,"—","SUMED",0,"MED"],
    [40,"SUERO FISIOLOGICO 1000 ML","UNIDAD",10,"—","SUMED",0,"MED"],
    [41,"TRACUR SOL. IMY.","UNIDAD",5,"TRACUR","FARMACIA INFANTIL",47989,"MED"],
    [42,"TRIFAMOX INL DUO","UNIDAD",5,"TRIFAMOX INL DUO","FARMACIA INFANTIL",25869,"MED"],
    [43,"VENDA SEMIELASTICA 50m","UNIDAD",5,"—","FARMACIA INFANTIL",8811,"MED"],
    [44,"XYLESTESIN 2% C/E X 20 ML","UNIDAD",5,"XYLESTESIN","DIPROAN",25500,"MED"],
    [45,"XYLESTESIN 2% JALEA","UNIDAD",2,"XYLESTESIN","DIPROAN",22050,"MED"],
    [46,"XYLESTESIN 2% S/E X 20 ML","UNIDAD",5,"XYLESTESIN","DIPROAN",25500,"MED"],
    [47,"XYLESTESIN SPRAY X 50 ML","UNIDAD",3,"—","DIPROAN",25500,"MED"],
    [48,"AGUJA RAQUIDEA NRO 27 G","UNIDAD",5,"—","DIPROAN",38500,"DESC"],
    [49,"AGUA BIDESTILADA ENVASA 1000 ML","UNIDAD",10,"—","GAESA",15500,"DESC"],
    [50,"AGUA OXIGENADA DE 500 ML","UNIDAD",10,"—","SUMED",5000,"DESC"],
    [51,"AGUJA DESCARTABLE 25 X 5/8 NARANJA","UNIDAD",200,"—","SUMED",185,"DESC"],
    [52,"AGUJA DESCARTABLE NRO 23 X 1","UNIDAD",200,"—","SUMED",185,"DESC"],
    [53,"AGUJA DESCARTABLE NRO 25 X","UNIDAD",50,"—","GAESA",185,"DESC"],
    [54,"AGUJA ESPINAL PENCAN NRO 27","UNIDAD",100,"—","SUMED",55000,"DESC"],
    [55,"AGUJA P. LANCET NRO 27 G","UNIDAD",10,"—","GAESA",22000,"DESC"],
    [56,"ALCOHOL RECTIFICADO 96% X 1000CC","UNIDAD",5,"—","GAESA",21000,"DESC"],
    [57,"ALGODON LAMINADO 10CM","UNIDAD",10,"MIMOSO","GAESA",5000,"DESC"],
    [58,"ALGODON LAMINADO 15 CM","UNIDAD",5,"—","SUMED",12500,"DESC"],
    [59,"ALGODON LAMINADO 20CM","UNIDAD",5,"—","SUMED",15500,"DESC"],
    [60,"BACTIGRAS X 10 PARCHES","UNIDAD",15,"—","SUMED",12000,"DESC"],
    [61,"BOLSA BLANCA X 7 LITROS","UNIDAD",30,"—","GAESA",7500,"DESC"],
    [62,"CABESTRILLO T 2","UNIDAD",25,"—","HOSPITALAR",36000,"DESC"],
    [63,"CATETER INTRAVENOSO NRO 14","UNIDAD",10,"—","HOSPITALAR",52000,"DESC"],
    [64,"CATETER INTRAVENOSO NRO 16","UNIDAD",10,"—","HOSPITALAR",3000,"DESC"],
    [65,"CATETER INTRAVENOSO NRO 18","UNIDAD",10,"—","HOSPITALAR",3000,"DESC"],
    [66,"CATETER INTRAVENOSO NRO 20","UNIDAD",10,"—","HOSPITALAR",30000,"DESC"],
    [67,"CATETER INTRAVENOSO NRO 22","UNIDAD",30,"—","HOSPITALAR",3000,"DESC"],
    [68,"CATETER INTRAVENOSO NRO 24","UNIDAD",30,"—","HOSPITALAR",3000,"DESC"],
    [69,"CATETER VENOSO CENTRAL 3V 4FRX 1 CM","UNIDAD",5,"—","CODEX",300000,"DESC"],
    [70,"CATGUT CROMADO 3-0 OTE","UNIDAD",12,"CATGUT","DPM",23265,"DESC"],
    [71,"CATGUT CROMADO 3-0 DTE","UNIDAD",5,"CATGUT","DPM",23265,"DESC"],
    [72,"CATGUT CROMADO 4-0 DRB","UNIDAD",12,"CATGUT","DPM",22523,"DESC"],
    [73,"CATGUT CROMADO 5-0 DRB","UNIDAD",12,"CATGUT","DPM",25675,"DESC"],
    [74,"CATGUT CROMADO 5-0/DSH-1","UNIDAD",15,"CATGUT","DPM",25675,"DESC"],
    [75,"CATGUT SIMPLE 2-0 DCT","UNIDAD",15,"CATGUT","DPM",22523,"DESC"],
    [76,"CATGUT SIMPLE E 0 DCT","UNIDAD",12,"CATGUT","DPM",21863,"DESC"],
    [77,"CATGUT SIMPLE 4-0/DRB","UNIDAD",12,"CATGUT","DPM",22523,"DESC"],
    [78,"CATGUT SIMPLE 4-0/DRB-1","UNIDAD",15,"CATGUT","DPM",22523,"DESC"],
    [79,"CATGUT SIMPLE 5-0/DRB-1 UR","UNIDAD",15,"CATGUT","DPM",21945,"DESC"],
    [80,"CIRCUITO PEDIATRICO ANESTESIA C/Y S/P","UNIDAD",4,"—","DPM",50160,"DESC"],
    [81,"COMPRESA QUIRURGICA 45 X 45 CM","UNIDAD",10,"—","GAESA",5000,"DESC"],
    [82,"CUTICELL 7.5 X 7.5","UNIDAD",100,"GREET MED","SUMED",650,"DESC"],
    [83,"DEMECAPRONE 4-0/DPS-2","UNIDAD",4,"DEMECAPRONE","DPM",41003,"DESC"],
    [84,"DEMEDIOX 5-0 DC","UNIDAD",5,"DEMEDIOX","DPM",106173,"DESC"],
    [85,"DEMEDIOX 6-0","UNIDAD",5,"DEMEDIOX","DPM",106173,"DESC"],
    [86,"DREN PENROSE 2","UNIDAD",5,"—","SUMED",6883,"DESC"],
    [87,"ELASTOMULL 10CM","UNIDAD",10,"—","DPM",7425,"DESC"],
    [88,"ELECTRODO ADULTO / ECG","UNIDAD",50,"—","DPM",132330,"DESC"],
    [89,"ELECTRODO AMB PEDIATRICO X 50","UNIDAD",50,"—","DPM",132330,"DESC"],
    [90,"EQUIPO MACROGOTERO 200 A PRESION","UNIDAD",20,"BEL MED","GAESA",2500,"DESC"],
    [91,"EQUIPO MICROGOTERO","UNIDAD",25,"—","HOSPITALAR",2500,"DESC"],
    [92,"EQUIPO VOLUTROL MACRO 20 DROPS 150 ML","UNIDAD",30,"BEL MED","GAESA",9000,"DESC"],
    [93,"EQUIPO VOLUTROL MICROGOTERO 150 ML","UNIDAD",15,"—","HOSPITALAR",10000,"DESC"],
    [94,"FILTRO HUMIFICADOR PEDIATRICO","UNIDAD",10,"—","DPM",18233,"DESC"],
    [95,"FILTRO VIROBAC PIANESTESIA","UNIDAD",5,"—","DPM",18233,"DESC"],
    [96,"FRASCO DE DRENAJE DE TORAX 500 ML","UNIDAD",4,"—","CODEX",120000,"DESC"],
    [97,"FUNDA DE CAMARA ENROLLADA","UNIDAD",30,"—","GAESA",1500,"DESC"],
    [98,"GUANTE DE EXAMEN M","UNIDAD",100,"—","HOSPITALAR",34500,"DESC"],
    [99,"GUANTE ESTERIL NRO 6.5","UNIDAD",50,"—","HOSPITALAR",3800,"DESC"],
    [100,"GUANTE ESTERIL NRO 7","UNIDAD",50,"—","HOSPITALAR",3500,"DESC"],
    [101,"GUANTE ESTERIL NRO 7.5","UNIDAD",50,"—","HOSPITALAR",3500,"DESC"],
    [102,"GUANTE HIPO ALERGENICO 6.5","UNIDAD",50,"B. BRAUN","GAESA",27000,"DESC"],
    [103,"GUANTE HIPO ALERGENICO 7","UNIDAD",50,"B. BRAUN","GAESA",27000,"DESC"],
    [104,"GUANTE HIPO ALERGENICO 7.5","UNIDAD",50,"B. BRAUN","GAESA",27000,"DESC"],
    [105,"JERINGA 3 CC","UNIDAD",100,"—","SUMED",490,"DESC"],
    [106,"JERINGA 5 CC","UNIDAD",100,"—","SUMED",630,"DESC"],
    [107,"JERINGA 10 CC","UNIDAD",100,"—","SUMED",790,"DESC"],
    [108,"JERINGA 20 CC","UNIDAD",100,"—","SUMED",1070,"DESC"],
    [109,"JERINGA DE INSULINA 1 CC","UNIDAD",20,"—","SUMED",1500,"DESC"],
    [110,"LAMINA BISTER N 15 C/ CONEXION","UNIDAD",30,"—","—",0,"DESC"],
    [111,"LAMINA BISTER N 17","UNIDAD",60,"—","—",0,"DESC"],
    [112,"LAMINA BISTERI N 23","UNIDAD",100,"—","—",0,"DESC"],
    [113,"MASCARA PARA ANESTESIA NRO 3","UNIDAD",5,"—","HOSPITALAR",17688,"DESC"],
    [114,"MASCARA PARA ANESTESIA NRO 4","UNIDAD",5,"—","DIPROAN",17688,"DESC"],
    [115,"MASCARA PARA ANESTESIA NRO 5","UNIDAD",5,"—","DIPROAN",1500,"DESC"],
    [116,"MASCARILLA CON RESERVORIO ADULTO","UNIDAD",10,"—","DIPROAN",12000,"DESC"],
    [117,"MASCARILLA PARA OXIGENO ADULTO","UNIDAD",5,"—","HOSPITALAR",1500,"DESC"],
    [118,"MASCARILLA PARA OXIGENO PEDIATRICO","UNIDAD",10,"—","HOSPITALAR",1500,"DESC"],
    [119,"MICROPORE 1/2 X 10 YARDAS","UNIDAD",10,"—","HOSPITALAR",7800,"DESC"],
    [120,"MICROPORE 3 X 10 YARDAS","UNIDAD",10,"—","HOSPITALAR",15200,"DESC"],
    [121,"PAPEL TERMICO P/ESTERILIZACION","UNIDAD",10,"—","GAESA",24000,"DESC"],
    [122,"POLIGLA 910 NRO 2-0/DSH","UNIDAD",12,"POLIGLA 910","DPM",25575,"DESC"],
    [123,"POLIGLA 910 NRO 6-0 DRB","UNIDAD",15,"POLIGLA 910","DPM",25575,"DESC"],
    [124,"POLIGLA 910 NRO 7-0 DC","UNIDAD",15,"POLIGLA 910","DPM",25575,"DESC"],
    [125,"ROPA DESCARTABLE AZUL T L","UNIDAD",10,"—","SUMED",15000,"DESC"],
    [126,"ROPA DESCARTABLE AZUL T XL","UNIDAD",10,"—","SUMED",17000,"DESC"],
    [127,"SEDA 2-0 DSH","UNIDAD",12,"SEDA","DPM",19890,"DESC"],
    [128,"SEDA 3-0 DSH","UNIDAD",10,"SEDA","DPM",19890,"DESC"],
    [129,"SEDA 4-0 DRB","UNIDAD",15,"SEDA","SUMED",19890,"DESC"],
    [130,"SEDA 5-0 DRB-1 UR","UNIDAD",15,"SEDA","SUMED",19890,"DESC"],
    [131,"SEDA NRO 1 DCT","UNIDAD",10,"SEDA","DPM",19890,"DESC"],
    [132,"SEDA NRO 2 DCT","UNIDAD",12,"SEDA","DPM",19890,"DESC"],
    [133,"SONDA F 9","UNIDAD",5,"—","—",0,"DESC"],
    [134,"SONDA F 12","UNIDAD",5,"—","—",0,"DESC"],
    [135,"TUBO ENDOTRAQUEAL C/BALON NRO 7.5","UNIDAD",20,"BEL MED","GAESA",2500,"DESC"],
    [136,"TUBO ENDOTRAQUEAL S/BALON NRO 3.0","UNIDAD",10,"—","DIPROAN",2900,"DESC"],
    [137,"TUBO ENDOTRAQUEAL S/BALON NRO 3.5","UNIDAD",10,"—","DIPROAN",12000,"DESC"],
    [138,"TUBO ENDOTRAQUEAL S/BALON NRO 4.0","UNIDAD",10,"—","DIPROAN",12000,"DESC"],
    [139,"TUBO ENDOTRAQUEAL S/BALON NRO 4.5","UNIDAD",10,"—","DIPROAN",12000,"DESC"],
    [140,"TUBO ENDOTRAQUEAL S/BALON NRO 5.0","UNIDAD",10,"—","DIPROAN",12000,"DESC"],
    [141,"TUBO ENDOTRAQUEAL S/BALON NRO 5.5","UNIDAD",10,"—","DIPROAN",12000,"DESC"],
    [142,"VENDA CREPE 15CM X 4 M","UNIDAD",10,"—","HOSPITALAR",10000,"DESC"],
    [143,"VENDA CREPE 10CM X 4 M","UNIDAD",10,"—","HOSPITALAR",12000,"DESC"],
    [144,"VENDA ELASTICA 15 CM X 4 M","UNIDAD",10,"—","HOSPITALAR",15000,"DESC"],
  ];
}
