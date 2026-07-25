const fs = require('fs');
const file = 'frontend/app/settings/steps/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  `} : group.steps).map((s: any) => {`,
  `<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>\n                    {(focusStepId ? group.steps.filter((s: any) => s.id === focusStepId) : group.steps).map((s: any) => {`
);

content = content.replace(
  `              );
            })}
                )}
              </div>
            ))}
          </div>
        )}
      </div>`,
  `              );
            })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>`
);

fs.writeFileSync(file, content);
console.log("fixed");
