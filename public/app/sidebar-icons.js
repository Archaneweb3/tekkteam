const navAssets={
 overview:'home',
 agents:'agents',
 tokens:'tokens',
 market:'market',
 skins:'characters-robot',
 traders:'trading',
 leaderboard:'leaderboard',
 payroll:'payroll',
 how:'guide',
 wallet:'wallet'
};

export function sidebarIcon(name){
 const asset=navAssets[name];
 if(asset)return `<img class="tw-sidebar-icon" src="/assets/nav-icons/${asset}.webp" width="28" height="28" alt="" aria-hidden="true" decoding="async">`;
 // The brand crown is not a navigation icon.
 return '<svg class="tw-sidebar-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="m3 8 8 6 5-11 5 11 8-6-4 20H7z" fill="#ffd638" stroke="#fff09b" stroke-width="2"/><path d="M8 24h16" stroke="#e4911f" stroke-width="3"/></svg>';
}
