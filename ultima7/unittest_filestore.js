import { fileStore } from './filestore.js';

async function testFileStore() {
  console.log("=== unittest_filestore ===");
  const fileName = 'test.bin';

  // create a binary data
  const dataToStore = new Uint8Array(256);
  for (let i = 0; i < dataToStore.length; i++) {
    dataToStore[i] = i % 256;
  }

  // write to IndexedDB
  await fileStore.set([{filename:fileName, uint8:dataToStore}]);
  console.log("Data saved to IndexedDB.");

  // read from IndexedDB
  const loadedData = await fileStore.get(fileName);
  if (!loadedData) {
    console.error("Failed to load data from IndexedDB");
    return;
  }

  // verify the data integrity
  let isEqual = loadedData.length === dataToStore.length;
  for (let i = 0; i < loadedData.length && isEqual; i++) {
    if (loadedData[i] !== dataToStore[i]) isEqual = false;
  }

  console.log("Data loaded correctly:", isEqual);

  await fileStore.remove('test.bin');
  console.log('Test data removed');
}

await testFileStore();

