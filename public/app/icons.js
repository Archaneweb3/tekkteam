import {productIcon} from './product-icons.js';
// Product navigation uses original geometry; familiar utility actions retain Lucide.
export const icon = name => productIcon(name) || window.TekkworkIcon(name);
