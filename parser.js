// loading and parsing
const csv = require('csv');
const fs = require('fs');
var ProgressBar = require('progress');

// headers: array of column header names
// input: array of input values
// objMerge: merge into
//
// the first value is used as key.
function _csvToObj(headers, input, objMerge) {
  let objKey = input[0];
  for (index = 1; index < input.length; index++) {
    if (index >= headers.length) {
      // console.warn('out of range index in headers', index, headers, input);
      outputKey = 'index_' + index;
    } else {
      outputKey = headers[index];
    }
    if (!objMerge.hasOwnProperty(objKey)) {
      objMerge[objKey] = {};
    }
    // objMerge[objKey][outputKey] = Object.assign({}, input[index]);
    // objMerge[objKey][outputKey] = input[index];
    objMerge[objKey][outputKey] = (' ' + input[index]).slice(1);
    // console.log('assigned:', input[index], objMerge[objKey][outputKey]);
  }
}

// Reads csv into na object.
// filenameCsv: path and file
// headersParam: array of column names. If undefined, first row will be loaded for columns.
// dictMergeInto: Merges csv data into thie dictionary.
async function readCsvAndMergeCounts(
  filenameCsv,
  dictMergeInto,
  headersParam = undefined,
  maxLines = 100000,
) {
  // Visualize progress.
  console.log('loading ', filenameCsv);
  var bar = new ProgressBar(`  processing, based on ${maxLines} lines [:bar] :rate/bps :percent :etas`, {
    complete: '=',
    incomplete: ' ',
    width: 20,
    total: maxLines,
  });
  let headers = headersParam;
  let lines_read = 0;
  return new Promise((resolve, reject) => {
    // read csv and merge into object.
    fs.createReadStream(filenameCsv)
        .pipe(csv.parse({delimiter: ',', relax: true, preserve_quoted_value: true, relax_column_count: true}))
        .on('data', async (csvrow) => {
          // process.stdout.write(`.`);
          bar.tick(1);
          // Convert load data int oan object, first field becomes key. field0 : { fiel1, ... }.
          try {
            // If headers isn't specified, use first row as headers.
            if (headers === undefined || headers == null) {
              console.log('read column names:', csvrow.join(','));
              headers = csvrow;
            } else {
              _csvToObj(headers, csvrow, dictMergeInto);
            }
            lines_read++;
          } catch (error) {
              console.log('error _csvToObj(headers, csvrow, dictMergeInto)',
              headers, csvrow, dictMergeInto, error);
          }
        })
        .on('end', () => {
          bar.tick(1000000);
          console.log(`read csv file: ${filenameCsv}, ${lines_read} lines.`);
          resolve(true);
        }).on('error', () => {
          console.log(`error reading csv file: ${filenameCsv}, ${lines_read} lines.`);
          reject();
        });;
    });
}

module.exports = { readCsvAndMergeCounts };