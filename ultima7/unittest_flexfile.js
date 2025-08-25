import { FlexFile } from './flexfile.js';

async function testFlexFile() {
  console.log("=== unittest_flexfile ===");

  // create a empty FlexFile instance, add an object, save to ArrayBuffer then open again
  const test = new FlexFile();
  const newData = test.newObject(128); // add a new 128 bytes object
  for(let i=0; i<newData.length; i++) newData[i] = i; // fill-in test data
  const savedBuffer = test.save("Test Title");

  const test2 = new FlexFile();
  const opened = await test2.open(savedBuffer);
  console.log("Open result:", opened);
  console.log("Title:", test2.title);
  console.log("Object count:", test2.objCount);
  console.log("First object size:", test2.objSize(0));

  // verify the data integrity
  const loadedData = test2.objData(0);
  let isEqual = newData.length === loadedData.length;
  for (let i = 0; i < loadedData.length && isEqual; i++) {
    if (loadedData[i] !== newData[i]) isEqual = false;
  }

  console.log("Data loaded correctly:", isEqual);
}

await testFlexFile();
