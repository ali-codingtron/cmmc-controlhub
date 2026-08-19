import { DefaultAzureCredential } from "@azure/identity";
import {
  BlobSASPermissions,
  BlobServiceClient,
  ContainerClient,
  generateBlobSASQueryParameters,
  SASProtocol,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { randomUUID } from "crypto";
import { PassThrough, Readable } from "stream";
import {
  ObjectAclPolicy,
  ObjectFile,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const DEFAULT_PRIVATE_PREFIX = "private";
const DEFAULT_PUBLIC_PREFIX = "public";

type BlobMetadata = {
  contentType?: string;
  contentDisposition?: string;
  metadata?: Record<string, string>;
  size?: number;
};

type SaveOptions = {
  contentType?: string;
  metadata?: Record<string, string>;
};

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

/**
 * Small compatibility adapter for the storage operations already used by the
 * routes. Azure Blob names map directly to the previous object names, so
 * existing `/objects/<key>` database records and callers keep their shape.
 */
export class AzureBlobFile implements ObjectFile {
  constructor(
    private readonly container: ContainerClient,
    public readonly name: string,
  ) {}

  private get client() {
    return this.container.getBlockBlobClient(this.name);
  }

  async exists(): Promise<[boolean]> {
    return [await this.client.exists()];
  }

  async getMetadata(): Promise<[BlobMetadata]> {
    const properties = await this.client.getProperties();
    return [
      {
        contentType: properties.contentType,
        contentDisposition: properties.contentDisposition,
        metadata: properties.metadata,
        size: properties.contentLength,
      },
    ];
  }

  createReadStream(): PassThrough {
    const output = new PassThrough();

    void this.client
      .download()
      .then((response) => {
        if (!response.readableStreamBody) {
          output.end();
          return;
        }
        response.readableStreamBody.on("error", (error) => output.destroy(error));
        response.readableStreamBody.pipe(output);
      })
      .catch((error) => output.destroy(error));

    return output;
  }

  async download(): Promise<[Buffer]> {
    const response = await this.client.download();
    if (!response.readableStreamBody) {
      return [Buffer.alloc(0)];
    }
    return [await streamToBuffer(response.readableStreamBody)];
  }

  async save(data: Buffer, options: SaveOptions = {}): Promise<void> {
    const { contentDisposition, ...customMetadata } = options.metadata ?? {};
    await this.client.uploadData(data, {
      metadata: customMetadata,
      blobHTTPHeaders: {
        blobContentType: options.contentType,
        blobContentDisposition: contentDisposition,
      },
    });
  }

  async delete(): Promise<void> {
    await this.client.deleteIfExists();
  }

  async setMetadata(options: {
    metadata: Record<string, string>;
  }): Promise<void> {
    await this.client.setMetadata(options.metadata);
  }
}

class AzureContainerAdapter {
  constructor(private readonly container: ContainerClient) {}

  file(objectName: string): AzureBlobFile {
    return new AzureBlobFile(this.container, objectName);
  }
}

class AzureObjectStorageClient {
  bucket(containerName: string): AzureContainerAdapter {
    return new AzureContainerAdapter(
      getBlobServiceClient().getContainerClient(containerName),
    );
  }
}

export const objectStorageClient = new AzureObjectStorageClient();

let blobServiceClient: BlobServiceClient | undefined;
let sharedKeyCredential: StorageSharedKeyCredential | undefined;

function getBlobServiceClient(): BlobServiceClient {
  if (blobServiceClient) {
    return blobServiceClient;
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (connectionString) {
    const accountName = getConnectionStringValue(connectionString, "AccountName");
    const accountKey = getConnectionStringValue(connectionString, "AccountKey");
    if (accountName && accountKey) {
      sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
    }
    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    return blobServiceClient;
  }

  const accountUrl = getAzureStorageAccountUrl();
  const accountName = getAzureStorageAccountName(accountUrl);
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;

  sharedKeyCredential = accountKey
    ? new StorageSharedKeyCredential(accountName, accountKey)
    : undefined;
  blobServiceClient = new BlobServiceClient(
    accountUrl,
    sharedKeyCredential ?? new DefaultAzureCredential(),
  );
  return blobServiceClient;
}

function getAzureStorageAccountUrl(): string {
  const configuredUrl = process.env.AZURE_STORAGE_ACCOUNT_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME?.trim();
  if (accountName) {
    return `https://${accountName}.blob.core.windows.net`;
  }

  throw new Error(
    "Azure Blob Storage is not configured. Set AZURE_STORAGE_CONNECTION_STRING " +
      "or AZURE_STORAGE_ACCOUNT_URL (recommended for App Service managed identity).",
  );
}

function getAzureStorageAccountName(accountUrl: string): string {
  const hostname = new URL(accountUrl).hostname;
  const accountName = hostname.split(".")[0];
  if (!accountName) {
    throw new Error("Could not determine the Azure Storage account name.");
  }
  return accountName;
}

function getConnectionStringValue(
  connectionString: string,
  key: string,
): string | undefined {
  return connectionString
    .split(";")
    .map((part) => part.split("=", 2))
    .find(([entryKey]) => entryKey?.toLowerCase() === key.toLowerCase())
    ?.at(1);
}

export class ObjectStorageService {
  getStorageContainerName(): string {
    const containerName = process.env.AZURE_STORAGE_CONTAINER?.trim();
    if (!containerName) {
      throw new Error(
        "AZURE_STORAGE_CONTAINER is not set. Set it to the Azure Blob container " +
          "that stores ControlHUB files.",
      );
    }
    return containerName;
  }

  getPublicObjectSearchPaths(): Array<string> {
    const prefixes = (process.env.AZURE_STORAGE_PUBLIC_PREFIXES ??
      DEFAULT_PUBLIC_PREFIX)
      .split(",")
      .map((prefix) => prefix.trim().replace(/^\/+|\/+$/g, ""))
      .filter(Boolean);

    return Array.from(
      new Set(
        prefixes.map(
          (prefix) => `/${this.getStorageContainerName()}/${prefix}`,
        ),
      ),
    );
  }

  getPrivateObjectDir(): string {
    const prefix = (process.env.AZURE_STORAGE_PRIVATE_PREFIX ??
      DEFAULT_PRIVATE_PREFIX)
      .trim()
      .replace(/^\/+|\/+$/g, "");
    if (!prefix) {
      throw new Error(
        "AZURE_STORAGE_PRIVATE_PREFIX must contain a non-empty blob prefix.",
      );
    }
    return `/${this.getStorageContainerName()}/${prefix}`;
  }

  async searchPublicObject(filePath: string): Promise<AzureBlobFile | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath.replace(/^\/+/, "")}`;
      const { containerName, objectName } = parseObjectPath(fullPath);
      const file = objectStorageClient.bucket(containerName).file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  async downloadObject(
    file: AzureBlobFile,
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";
    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.contentDisposition) {
      headers["Content-Disposition"] = metadata.contentDisposition;
    }
    if (metadata.size !== undefined) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    const { containerName, objectName } = parseObjectPath(
      `${this.getPrivateObjectDir()}/uploads/${objectId}`,
    );

    return createUploadSasUrl(containerName, objectName);
  }

  async getObjectEntityFile(objectPath: string): Promise<AzureBlobFile> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const entityId = objectPath.slice("/objects/".length);
    if (!entityId) {
      throw new ObjectNotFoundError();
    }

    const { containerName, objectName } = parseObjectPath(
      `${this.getPrivateObjectDir()}/${entityId}`,
    );
    const objectFile = objectStorageClient.bucket(containerName).file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = decodeURIComponent(url.pathname);
    const privateDir = this.getPrivateObjectDir();

    if (!rawObjectPath.startsWith(`${privateDir}/`)) {
      return rawPath;
    }

    return `/objects/${rawObjectPath.slice(privateDir.length + 1)}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: AzureBlobFile;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  containerName: string;
  objectName: string;
} {
  const parts = path.replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Invalid blob path: expected a container and blob name.");
  }

  return {
    containerName: parts[0]!,
    objectName: parts.slice(1).join("/"),
  };
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function createUploadSasUrl(
  containerName: string,
  objectName: string,
): Promise<string> {
  const serviceClient = getBlobServiceClient();
  const startsOn = new Date(Date.now() - 60_000);
  const expiresOn = new Date(Date.now() + 15 * 60_000);
  const permissions = BlobSASPermissions.parse("cw");
  const accountName = getAzureStorageAccountName(serviceClient.url);

  let sasToken: string;
  if (sharedKeyCredential) {
    sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName: objectName,
        permissions,
        startsOn,
        expiresOn,
        protocol: SASProtocol.Https,
      },
      sharedKeyCredential,
    ).toString();
  } else {
    const delegationKey = await serviceClient.getUserDelegationKey(
      startsOn,
      expiresOn,
    );
    sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName: objectName,
        permissions,
        startsOn,
        expiresOn,
        protocol: SASProtocol.Https,
      },
      delegationKey,
      accountName,
    ).toString();
  }

  return `${serviceClient
    .getContainerClient(containerName)
    .getBlockBlobClient(objectName).url}?${sasToken}`;
}