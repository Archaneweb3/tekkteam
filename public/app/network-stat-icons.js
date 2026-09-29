// Original compact HUD pictograms; fixed geometry, no image requests.
export function networkStatIcon(kind){
 const shapes={
 agents:'<g fill="#25d8ff"><circle cx="16" cy="8" r="4"/><circle cx="7" cy="11" r="3"/><circle cx="25" cy="11" r="3"/><path d="M2 27v-8a5 5 0 0 1 10 0v8m8 0v-8a5 5 0 0 1 10 0v8"/><path d="M9 28V18a7 7 0 0 1 14 0v10z"/></g>',
 trades:'<path d="M3 26h26" stroke="#406abf"/><path d="M5 24v-7h5v7m4 0V12h5v12m4 0V5h5v19" fill="#00bdff"/><path d="m3 12 7-6 5 3 9-7" fill="none" stroke="#ffbd3b" stroke-width="2.5"/>',
 capital:'<circle cx="16" cy="16" r="13" fill="#ff9f18"/><circle cx="16" cy="16" r="9" fill="#ffd850" stroke="#fff39d"/><path d="M20 10h-6l-3 3h8l2 3-3 3h-7m5-12v17" stroke="#a55e10" fill="none"/>',
 pnl:'<path d="m16 2 12 12h-8v16h-8V14H4z" fill="#20e99c"/><path d="m8 12 8-8 8 8" fill="none" stroke="#a2ffcc"/>',
 best:'<path d="m3 8 7 5 6-10 6 10 7-5-4 19H7z" fill="#ffce38"/><path d="M8 22h16" stroke="#ec8b14" stroke-width="3"/><circle cx="16" cy="16" r="2" fill="#ff664b"/>',
 fees:'<path d="M4 12v13c0 5 24 5 24 0V12" fill="#ffa222"/><ellipse cx="16" cy="12" rx="12" ry="5" fill="#ffe166"/><path d="M4 18c0 5 24 5 24 0M4 23c0 5 24 5 24 0" stroke="#ffe577" fill="none"/>'
 };
 return `<svg viewBox="0 0 32 32" aria-hidden="true" class="network-stat-icon"><g stroke="#08234a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${shapes[kind]??''}</g></svg>`;
}
