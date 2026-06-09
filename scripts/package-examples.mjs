import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("public/examples", { recursive: true });

const manifest = {
  generatedAt: new Date().toISOString(),
  policy: "QuantCred does not ship synthetic performance examples. Use verifiable source datasets or your own audit files.",
  officialSources: [
    {
      name: "Kenneth R. French Data Library",
      url: "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
      supportedByImporter: true,
      notes: "The Fama/French daily factor CSV/ZIP is detected and locally converted from percent returns to decimal returns. RF is excluded from strategy selection."
    }
  ],
  supportedSchemas: [
    "date,return",
    "date,strategy_001,strategy_002,...",
    "date,symbol,side,quantity,price,fees,borrow_cost,spread_bps,adv,notional",
    "date,symbol,weight,notional,sector,country,market_cap,adv",
    "date,mkt,size,value,momentum,quality,low_vol"
  ]
};

writeFileSync("public/examples/real-data-sources.json", JSON.stringify(manifest, null, 2));
