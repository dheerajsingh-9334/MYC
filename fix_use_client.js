const fs = require('fs');
const file = 'frontend/app/settings/steps/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace('import ActionDropdown from "@/components/ui/ActionDropdown";\\n\\'use client\\';', '\\'use client\\';\\nimport ActionDropdown from "@/components/ui/ActionDropdown";');
if (!content.startsWith("'use client';")) {
    content = content.replace(/^.*?(?='use client';)/s, '');
}

fs.writeFileSync(file, content);
