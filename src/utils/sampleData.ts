// UPDATE 2026-08-20: [ベンチマークデータ生成器] 巨大データセット（1万〜10万行）の即時生成
// 先頭ゼロ、日付、文字列コード、日本語品名を含み、型破壊が起きないことを検証可能にする

export function generateBenchmarkCsv(rowCount: number = 10000, isTsv: boolean = false): string {
  const delimiter = isTsv ? '\t' : ',';
  const headers = [
    'ItemCode',
    'ProductSKU',
    'Category',
    'ItemName_JP',
    'UnitPrice',
    'StockQty',
    'RegisteredDate',
    'TaxRate',
    'BarCode13',
    'StatusCode',
    'MemoNote',
  ];

  const categories = ['Electronics', 'OfficeSupplies', 'Hardware', 'PrecisionTools', 'Chemicals', 'Logistics'];
  const jpNames = [
    '超精密デジタルノギス 0.01mm',
    '高耐久六角ボルト M8x25 (SUS304)',
    '静電破壊防止リストストラップ',
    '産業用リチウム電池 3.7V 2500mAh',
    '耐熱PTFEテフロンチューブ 4x6',
    '超音波洗浄機用特殊洗剤 4L',
    '光ファイバーパッチコード SC-LC',
    '高精度ロードセル 50kgf',
  ];
  const statuses = ['ACTIVE', 'PENDING', 'OBSOLETE', 'DISCONTINUED', 'SPECIAL_ORDER'];

  const lines: string[] = [];
  lines.push(headers.join(delimiter));

  for (let i = 1; i <= rowCount; i++) {
    // 0埋めコード（Excelが壊しやすい値の検証用）
    const itemCode = `00${(i % 9999).toString().padStart(6, '0')}`;
    const productSku = `SKU-2026-${(100000 + (i * 7) % 899999).toString()}`;
    const category = categories[i % categories.length];
    const jpName = jpNames[i % jpNames.length];
    const unitPrice = (500 + (i * 37) % 95000).toString();
    const stockQty = ((i * 13) % 450).toString();
    const month = ((i % 12) + 1).toString().padStart(2, '0');
    const day = ((i % 28) + 1).toString().padStart(2, '0');
    const registeredDate = `2026-${month}-${day}`;
    const taxRate = '0.10';
    // 13桁バーコード（数値型変換されると指数表記になって壊れる例）
    const barCode13 = `4901234${(500000 + (i % 499999)).toString()}`;
    const statusCode = statuses[i % statuses.length];
    const memo = `QC-PASS #lot-${Math.floor(i / 100)}`;

    const row = [
      itemCode,
      productSku,
      category,
      `"${jpName}"`,
      unitPrice,
      stockQty,
      registeredDate,
      taxRate,
      barCode13,
      statusCode,
      `"${memo}"`,
    ];

    lines.push(row.join(delimiter));
  }

  return lines.join('\n');
}
