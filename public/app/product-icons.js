// Original TEKKWORK geometry. Utility actions continue to use the Lucide subset.
const shapes = {
 overview:'<path d="M3 4h7v7H3zM14 4h7v4h-7zM14 12h7v9h-7zM3 15h7v6H3z"/>',
 agents:'<path d="M8 3h8v7H8zM5 14l4-2h6l4 2v7H5z"/><path d="M1 7h3v5H1m22-5h-3v5h3" fill="none"/>',
 tokens:'<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="M8 8h8m-4 0v8" fill="none"/>',
 skins:'<path d="m8 3-5 4 3 5 2-1v10h8V11l2 1 3-5-5-4-4 3z"/>',
 how:'<path d="M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3z"/><path d="M12 7v10M6 8h3m6 0h3M6 12h3m6 0h3" fill="none"/>',
 trade:'<path d="M3 16h4v5H3zM10 11h4v10h-4zM17 5h4v16h-4z"/><path d="m3 10 6-5 4 2 6-5" fill="none"/>',
 payroll:'<path d="M3 6h18v15H3zM7 3h10v3"/><path d="M3 11h18M9 14h6v4H9z" fill="none"/>',
 leaderboard:'<path d="M8 9V3h8v6l-4 4zM3 16h5v5H3zM9 13h6v8H9zM16 17h5v4h-5z"/><path d="M5 4v4l3 2m11-6v4l-3 2" fill="none"/>',
 paper:'<path d="M5 2h10l4 4v16H5z"/><path d="M14 2v5h5M8 11h8M8 15h8M8 19h5" fill="none"/>',
 wallet:'<path d="M3 5h16v4h2v11H3z"/><path d="M3 5V3h14v2m4 7h-7v5h7" fill="none"/><circle cx="17" cy="14.5" r=".8" fill="currentColor" stroke="none"/>',
 strategy:'<path d="M9 3h6v6H9zM2 15h6v6H2zM16 15h6v6h-6z"/><path d="M12 9v3H5v3m7-3h7v3" fill="none"/>',
 risk:'<path d="m12 2 9 4-2 10-7 6-7-6L3 6z"/><path d="M12 7v6m0 3v1" fill="none"/>',
 positions:'<path d="m3 7 9-5 9 5-9 5zM3 12l9 5 9-5M3 17l9 5 9-5" fill="none"/>',
};
shapes.traders=shapes.trade;
export function productIcon(name){
 const shape=shapes[name];
 return shape?`<svg class="tw-icon tw-product-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true" focusable="false">${shape}</svg>`:null;
}
export function rankMarker(rank){
 const value=Number(rank);
 if(!Number.isInteger(value)||value<1||value>3)return '';
 const marks={1:'M12 10v11m-3-8 3-3',2:'M9 12v-2h6v5l-6 4v2h6',3:'M9 10h6v11H9m3-6h3'};
 return `<svg class="tw-rank-marker tw-rank-marker--${value}" viewBox="0 0 28 32" width="28" height="32" aria-hidden="true" focusable="false"><path d="M5 1h18l4 5v20l-13 5L1 26V6z" fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-width="1.2"/><path d="M6 5h16M6 26l8 3 8-3" fill="none" stroke="currentColor" stroke-opacity=".4"/><path d="${marks[value]}" transform="translate(2 0)" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="square" stroke-linejoin="miter"/></svg>`;
}
