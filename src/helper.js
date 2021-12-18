import { alea } from 'seedrandom'
export function shuffle(array, seed) {
  let arrayCopy = [...array]
  let rng = alea(seed ?? Math.random() * 10000000);
  let shuffleArr = []
  while (arrayCopy.length > 0) {
    let index = Math.floor(rng() * arrayCopy.length) % (arrayCopy.length);
    shuffleArr.push(arrayCopy.splice(index, 1)[0]);
  }

  //sort cheat to make observatory easier to get.
  if (false) {
    let foundOne = false;
    for (const obsId of [28 + 29, 28 + 30]) {
      if (shuffleArr.includes(obsId) && !foundOne) {
        let indexOfObs = shuffleArr.indexOf(obsId);
        if (indexOfObs != -1) {
          shuffleArr.splice(indexOfObs, 1)[0]
          shuffleArr.unshift(obsId)
          foundOne = true;
        }
      }
    }
  }
  return shuffleArr;
  // return array.sort(() => (seed ? alea(seed) : Math.random()) - 0.5);
}
export function splitIntoChunks(array, chunkSizes) {
  let ret = [];
  let j = 0;
  for (let i = 0; i < chunkSizes.length; i++) {
    ret.push(array.slice(j, j + chunkSizes[i]));
    j += chunkSizes[i];
  }
  return ret;
}
export function randomFromArray(array, amount, seed) {
  let arrayShuffled = shuffle(array, seed);
  let choices = arrayShuffled.slice(0, amount)
  let ret_array = arrayShuffled.slice(amount)
  return [ret_array.sort(), choices]
}

export function deepEqual(object1, object2) {
  const keys1 = Object.keys(object1);
  const keys2 = Object.keys(object2);
  if (keys1.length !== keys2.length) {
    return false;
  }
  for (const key of keys1) {
    const val1 = object1[key];
    const val2 = object2[key];
    const areObjects = isObject(val1) && isObject(val2);
    if (
      areObjects && !deepEqual(val1, val2) ||
      !areObjects && val1 !== val2
    ) {
      return false;
    }
  }
  return true;
}
function isObject(object) {
  return object != null && typeof object === 'object';
}


export function getKeyByValue(object, value) {
  return Object.keys(object).find(key => object[key] === value);
}