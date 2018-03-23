// command line tool to read instagram follower counts
// based on:
// https://www.smashingmagazine.com/2017/03/interactive-command-line-application-node-js/

const program = require('commander');
const csv = require('csv');
const fs = require('fs');
const axios = require('axios');
const { readCsvAndMergeCounts } = require('./parser.js');

// Minimum occurances count to fetch.
const minCountToFetch = 2;
// minimu follower threshold for text output exports.
const textOutputFetchMinimumFollowers = 1700;
// How often to write csv file.
const writeFrequency = 1000;
// delay between reads
let sleepTime = 500;
// factor if timeout occurs. 1.0 means no increase in delay.
let timeoutIncreaseFactor = 1.1;

let fetchedUsers = 0;

program
  .version('0.0.1')
  .option('-l, --list [list]', 'csv file with "account:count" rows')
  .option('-g, --list_generated [list_generated]', "csv file previously generated by this program")
  .option('-t, --text_output [text_output]', "output CSV file with text training data", true)
  .parse(process.argv)

let writeArray = [];

// Generates a comma delimited string from account object using keys in csvColumns Array.
function _accountToCsv(account, csvColumns) {
  let csvArray = [];
  for (const value of csvColumns) {
    csvArray.push(account[value]);
  }
  return csvArray.join(',');
}

// First row to emit in csv, column names.
const csvColumns = ['name','count','followers','likes','engagement','comments','id'];

// First row to emit in text csv, column names.
const csvColumnsText = ['name','followers','biography','external_url','full_name',
'profile_pic_url_hd','profile_pic_url','caption_0','caption_1','caption_2','caption_3',
'caption_4','caption_5','caption_6','caption_7','caption_8','caption_9','caption_10','caption_11'];

// Creater dir',' if it does not exist.
function createDirIfNotExists(dirName) {
  if (!fs.existsSync(dirName)){
    fs.mkdirSync(dirName);
    console.info(`created directory: ${dirName}.`);
  }
}

// Fetches user with retry. If it's a permanent error like 404',' returns false.
// If it's a temp error like connection problem, retries infinitely.
// Don't write this record if a 404 occurs.
async function fetchDataWithRetry(name, account) {
  // Retry with backoff.
  let retryConnect = true;
  let fetchedData = false;
  let retryDelay = sleepTime;
  while (retryConnect) {
    try {
      retryConnect = false;
      await processAccount(name, account);

      fetchedUsers += 1;
      fetchedData = true;
    } catch (error) {
      counters.fetchErrors += 1;

      // 429 is too many connections, increase timeout.
      if (error.status == '429' || error.status == 429) {
        sleepTime *= timeoutIncreaseFactor;
        console.error('fetch error, increasing delay, retrying. ',
          error.code, error.status, sleepTime, name, error);
        retryConnect = true;
        sleepTime += 200;
        await sleep(sleepTime * 2.0);
      } else {
        // Connection problems not related to throttling.
        switch(error.code) {
          case 'ENOTFOUND': // internet died
          case 'ECONNRESET': // internet connection died
          case 'ECONNABORTED': // timeout
            retryConnect = true;
            console.warn('connection problem, retrying with backoff..');
            retryDelay *= 2.0;
            retryDelay = Math.min(retryDelay, 120*1000);
            break;
          // other problem not related to connection, ie 404,
          default:
            console.error('unknown error, skipping user', error);
            break;
        }
      }
    }
    await sleep(retryDelay);
  }
  return fetchedData;
}

// Check these fields for refreshing non-textual data.
const checkFieldsRefresh = ['followers','likes','engagement','comments'];

// Check these fields for refreshing textual data.
const checkFieldsRefreshTextual = ['biography','external_url','full_name'];

// Returns true if data is invalid, undefined and needs to be fetched.
function needsRefetchData(account, fields) {
  for (const field of fields) {
    const value = account[field];
    if (
      value == undefined ||
      value == 'undefined' ||
      value == NaN ||
      value == 'NaN')
      return true;
  }
}

const counters = {
  total: 0,
  skipped_minCount: 0,
  skipped_cr: 0,
  skipped_permanent_error: 0,
  skipped_textOutMinFollowers: 0,
  fetch_tried: 0,
  fetch_skipped: 0,
  fetch_success: 0,
  wrote_success: 0,
  fetchErrors: 0,
}
async function updateMissingCounters(accountDict) {
  createDirIfNotExists(`./data`);

  // Add column decriptiors to csv
  writeArray.push(csvColumns.join(','));
  writeCounter = 0;
  textBlobs = [];

  // Iterate and update records that are missing data.
  for (let name in accountDict) {
    counters.total += 1;
    let account = accountDict[name];
    let count = account.count;

    // Skip acounts with insufficient count, or with :cr suffix.
    if (count < minCountToFetch || name.indexOf(':cr') !== -1) {
      counters.skipped_minCount += 1;
      continue;
    }
    if (name.indexOf(':cr') !== -1) {
      counters.skipped_cr += 1;
      continue;
    }
    // console.log('checking object with fields:', name, Object.keys(account));

    // if we're exporting text, set a follower threshold.
    if (program.text_output &&
      (account.followers && account.followers < textOutputFetchMinimumFollowers)) {
        counters.skipped_textOutMinFollowers += 1;
      continue;
    }

    // Check if this account needs to be refreshed because of invalid, missing data, or
    // because it has never been fetched.
    let needsRefresh = needsRefetchData(account, checkFieldsRefresh);
    // Optionally check for textual data refresh.
    if (!needsRefresh && program.text_output ) {
      needsRefresh |= needsRefetchData(account, checkFieldsRefreshTextual);
    }

    // Refetch if data isn't present.
    let shouldSaveData = true;
    if (needsRefresh) {
      process.stdout.write(`fetching ${name}... `, );

      // console.log('fetching object with fields:', name, Object.keys(account));
      counters.fetch_tried += 1;
      shouldSaveData = await fetchDataWithRetry(name, account);
      counters.fetch_success += 1;
    } else {
      counters.fetch_skipped += 1;
      console.log(`skipping already fetched ${name}... `, );
    }

    // Don't write this record an error like 404 occured.
    if (!shouldSaveData) {
      counters.skipped_permanent_error += 1;
      continue;
    }

    // Add CSV row for non-textual data.
    account.name = name;
    writeArray.push(_accountToCsv(account, csvColumns));
    counters.wrote_success += 1;
    writeCounter -= 1;

    // Add CSV row for textual data.
    if (program.text_output) {
      // For first row, add the column names.
      if (textBlobs.length == 0) {
        textBlobs.push(csvColumnsText.join(','));
      }
      textBlobs.push(_accountToCsv(account, csvColumnsText));
    }

    if (writeCounter <= 0) {
      console.log('saving checkpoint:\n', counters);

      version = writeArray.length;
      writeCsv(`./data/out${version}.csv`, writeArray.join('\n'));
      writeCounter = writeFrequency;
      if (program.text_output) {
        // also write text blobs
        writeCsv(`./data/outText${version}.csv`, textBlobs.join('\n'));
      }
    }
  }
  version = writeArray.length;
  writeCsv(`./data/out${version}_final.csv`, writeArray.join('\n'));
  console.log(`complete. fetched ${fetchedUsers} users.`)
  console.log(counters);
  if (program.text_output) {
    // also write text blobs
    writeCsv(`./data/outText${version}_final.csv`, textBlobs.join('\n'));
  }
}

async function sleep(ms){
  return new Promise((resolve) => setTimeout(resolve, ms));
};

async function writeCsv(filename, data) {
  return await fs.writeFile(filename, data, 'utf8', function (err) {
    if (err) {
      console.log('Some error occured - file either not saved or corrupted file saved.');
    } else{
      console.log('Wrote ', filename, fetchedUsers);
    }
  });
}

async function getFbData(username) {
  let response = undefined;
  try {
    var url = "https://www.instagram.com/" + username + "/?__a=1";
    response = await axios.get(url, {
      timeout: 2500
    });
    process.stdout.write(`fetched (${fetchedUsers})\n`);
  } catch (error) {
    let status = 'not_available';
    if (error.response) {
      status = error.response.status;
    }
    let text = `getFbData axios failed: ${username}, (${error}) code:${error.code} status:${status}`;
    console.error(text);
    let newError = new Error(text);
    newError.code = error.code; // connection error code, like 'ECONNABORTED' etc.
    newError.status = status;
    throw newError;
  }
  if (response.data == undefined || response.data == null) {
    error = new Error('response.data is invalid:' + response.data);
  }
  return response.data;
}

async function processAccount(accountName, account) {
  let response = await getFbData(accountName);
  // console.log('fetched:\n', JSON.stringify(response, null, 2));
  const userData = response.graphql.user;

  let followers = getInstagramFollowerCount(userData);
  let likes = getInstagramLikesCount(userData).toFixed(0);
  let engagement = 0;

  if (followers > 0) {
    engagement = (likes / followers * 100).toFixed(2);
  }

  account.followers = followers;
  account.likes = likes;
  account.engagement = engagement;

  account.comments = getInstagramCommentsCount(userData).toFixed(0);

  if (program.text_output) {
    getInstagramCaptions(userData, account);
  }
  account.id = userData.id;
}


function getInstagramFollowerCount(user) {
  var count = user.edge_followed_by.count;
  return Number(count);
}

function getInstagramLikesCount(user) {
  return getMedianMediaCounts(user, 'edge_liked_by');
}

function getInstagramCommentsCount(user) {
  return getMedianMediaCounts(user, 'edge_media_to_comment');
}

// Compute median of array of values.
function median(values) {
  values.sort( function(a,b) {return a - b;} );
  var half = Math.floor(values.length/2);
  if(values.length % 2)
      return values[half];
  else
      return (values[half-1] + values[half]) / 2.0;
}

function getMedianMediaCounts(user, type) {
  let counts = [];
  const nodes = user.edge_owner_to_timeline_media.edges;
  if (nodes.length == 0) {
    return 0;
  }
  for (var i = 1; i  < nodes.length; i++) {
    var node = nodes[i].node;
    if (node == null || node.is_video) {
      continue;
    }
    const count = node[type].count;
    // console.log('got count', count, type);
    counts.push(count);
  }
  return median(counts);
}

function _replaceCommasOrReturnEmpty(text) {
  /*
  let encoded = encodeURI(text);
  console.log(encoded);
  return encoded;
  */

  if (text == undefined || text == null) {
    return '';
  }

  // strip commas
  const commaReplacement = '¸';
  const regexComma = /,/ig;
  let result = text.replace(regexComma, commaReplacement);

  // strip linebreaks
  const linebreakRegex = /\r?\n|\r/g;
  result = result.replace(linebreakRegex, ' ');
  return result;
}

// Collects text fields including comment captions, urls, names, anything we can use
// for analysis.
function getInstagramCaptions(user, textBlob) {
  let samples = 0;
  let captionNum = 0;

  textBlob.biography = _replaceCommasOrReturnEmpty(user.biography);
  textBlob.external_url = _replaceCommasOrReturnEmpty(user.external_url);
  textBlob.full_name = _replaceCommasOrReturnEmpty(user.full_name);
  textBlob.profile_pic_url_hd = _replaceCommasOrReturnEmpty(user.profile_pic_url_hd);
  textBlob.profile_pic_url = _replaceCommasOrReturnEmpty(user.profile_pic_url);
  // TODO: Read and ignore private accounts in original fetcher
  // TODO: Read video views. Right now account with videos only get thronw out
  // because they show 0 likes and 0 media.
  const nodes = user.edge_owner_to_timeline_media.edges;
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i].node;
    if (node == null) {
      continue;
    }
    if (node.edge_media_to_caption.edges.length == 0) {
      continue;
    }
    text = node.edge_media_to_caption.edges[0].node.text;
    textBlob['caption_' + captionNum] = _replaceCommasOrReturnEmpty(text);
    captionNum++;
  }
}

// Main.
async function main() {
  let dictCounts = {};
  // Read the raw counst table first, output from crawler
  const columnNames = 'name,count';
  const csvpath = program.list;
  try {
    await readCsvAndMergeCounts(
      csvpath,
      dictCounts,
      columnNames.split(','),
      1500000,
    );
  } catch (error) {
    console.log('error loading program.list', csvpath, error);
    return;
  }

  if (program.list_generated) {
    try {
      const file = program.list_generated;
      await readCsvAndMergeCounts(
        file,
        dictCounts,
        undefined,
        150000,
      );
    } catch (error) {
        console.log('error loading', file, error);
        return;
    }
  }

  if (program.text_output) {
    try {
      const file = program.text_output;
      await readCsvAndMergeCounts(
        file,
        dictCounts,
        undefined,
        150000,
      );
    } catch (error) {
        console.log('error loading', file, error);
        return;
    }
  }
  await updateMissingCounters(dictCounts);
}

main();