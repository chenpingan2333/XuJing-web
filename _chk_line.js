const fs = require("fs");
const lines = fs.readFileSync("src/app/characters/new/page.tsx", "utf-8").split("\n");
for (let i = 373; i <= 378; i++) {
  console.log(i+1, JSON.stringify(lines[i]));
}
