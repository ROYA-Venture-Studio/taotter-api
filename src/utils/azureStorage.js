// utils/azureStorage.js

const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config();

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME;

if (!AZURE_STORAGE_CONNECTION_STRING) {
  console.error('AZURE_STORAGE_CONNECTION_STRING is not defined. Check your environment variables.');
  throw new Error('AZURE_STORAGE_CONNECTION_STRING is not defined.');
}
if (!AZURE_STORAGE_CONTAINER_NAME) {
  console.error('AZURE_STORAGE_CONTAINER_NAME is not defined. Check your environment variables.');
  throw new Error('AZURE_STORAGE_CONTAINER_NAME is not defined.');
}

// Initialize BlobServiceClient
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME);

/**
 * Upload a file to Azure Blob Storage
 * @param {Object} file - Multer file object (buffer, originalname, mimetype)
 * @param {String} userId
 * @param {String} sprintId
 * @param {String} documentType
 * @returns {Object} { success, fileUrl, fileName, error }
 */
async function uploadFile(file, userId, sprintId, documentType) {
  try {
    if (!file || !file.buffer) {
      throw new Error('No file buffer provided');
    }

    // Sanitize original name
    const sanitizedOriginalName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const ext = path.extname(sanitizedOriginalName);
    const uniqueName = `${Date.now()}-${uuidv4()}${ext}`;
    const blobPath = `uploads/${userId}/${sprintId}/${documentType}/${uniqueName}`;

    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    await blockBlobClient.uploadData(file.buffer, {
      blobHTTPHeaders: { blobContentType: file.mimetype }
    });

    const fileUrl = blockBlobClient.url;

    return {
      success: true,
      fileUrl,
      fileName: uniqueName
    };
  } catch (error) {
    console.log(error)
    return {
      success: false,
      error: error.message || error
    };
  }
}

/**
 * Delete a file from Azure Blob Storage
 * @param {String} fileUrl
 * @returns {Object} { success, error }
 */
async function deleteFile(fileUrl) {
  try {
    if (!fileUrl) throw new Error('No fileUrl provided');
    const url = new URL(fileUrl);
    const blobName = url.pathname.replace(`/${AZURE_STORAGE_CONTAINER_NAME}/`, '');
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.deleteIfExists();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || error };
  }
}

/**
 * Generate a signed URL for private access
 * @param {String} blobName
 * @param {Number} expiresInHours
 * @returns {Object} { success, signedUrl, error }
 */
function generateSignedUrl(blobName, expiresInHours = 1) {
  try {
    const accountName = blobServiceClient.accountName;
    const accountKey = AZURE_STORAGE_CONNECTION_STRING.match(/AccountKey=([^;]+)/)[1];
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

    const now = new Date();
    const expires = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000);

    const sasToken = generateBlobSASQueryParameters({
      containerName: AZURE_STORAGE_CONTAINER_NAME,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      startsOn: now,
      expiresOn: expires
    }, sharedKeyCredential).toString();

    const url = `https://${accountName}.blob.core.windows.net/${AZURE_STORAGE_CONTAINER_NAME}/${blobName}?${sasToken}`;
    return { success: true, signedUrl: url };
  } catch (error) {
    return { success: false, error: error.message || error };
  }
}

/**
 * List files in a folder
 * @param {String} userId
 * @param {String} sprintId
 * @param {String} documentType
 * @returns {Object} { success, files, error }
 */
async function listFiles(userId, sprintId, documentType) {
  try {
    const prefix = `uploads/${userId}/${sprintId}/${documentType}/`;
    const iter = containerClient.listBlobsFlat({ prefix });
    const files = [];
    for await (const blob of iter) {
      files.push({
        name: blob.name,
        url: containerClient.getBlockBlobClient(blob.name).url,
        contentType: blob.properties.contentType,
        size: blob.properties.contentLength
      });
    }
    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message || error };
  }
}

module.exports = {
  uploadFile,
  deleteFile,
  generateSignedUrl,
  listFiles
};
