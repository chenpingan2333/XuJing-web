const fs = require("fs");
let content = fs.readFileSync("src/app/characters/new/page.tsx", "utf-8");

// Find and fix the broken line
content = content.replace(
  'placeholder={"{{char}}: …\r\n{{user}}: …"}',
  'placeholder={"{{char}}: …\\n{{user}}: …"}'
);

fs.writeFileSync("src/app/characters/new/page.tsx", content, "utf-8");
console.log("Fixed");
