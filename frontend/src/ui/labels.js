/**
 * @typedef {import('../periods.js').Period} Period
 * @typedef {import('../data-activities.js').Source} Source
 * @typedef {import('../data-activities.js').Destination} Destination
 */

/** @param {Period[]} periods @param {number} index @returns {string} */
export function periodRange(periods, index) {
  const p = periods[index];
  return p ? `${p.startDay}–${p.endDay}` : `Period ${index + 1}`;
}

/** @param {Source} source @param {(id:string)=>string} envName @param {Period[]} periods @returns {string} */
export function describeSource(source, envName, periods) {
  switch (source.type) {
    case 'period': return periodRange(periods, source.periodIndex);
    case 'wholeMonth': return 'Whole month';
    case 'envelope': return envName(source.envelopeId);
    case 'outside': return 'Outside budget';
  }
}

/** @param {Destination} dest @param {(id:string)=>string} envName @param {Period[]} periods @returns {string} */
export function describeDestination(dest, envName, periods) {
  switch (dest.type) {
    case 'spent': return 'Spent';
    case 'period': return periodRange(periods, dest.periodIndex);
    case 'envelope': return envName(dest.envelopeId);
  }
}
