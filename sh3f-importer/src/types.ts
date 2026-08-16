export interface Sh3fAsset {
  readonly index: number;
  readonly id: string | undefined;
  readonly name: string;
  readonly description: string | undefined;
  readonly information: string | undefined;
  readonly tags: readonly string[];
  readonly category: string;
  readonly model: string;
  readonly icon: string | undefined;
  readonly planIcon: string | undefined;
  readonly widthCm: number;
  readonly depthCm: number;
  readonly heightCm: number;
  readonly elevationCm: number;
  readonly movable: boolean;
  readonly doorOrWindow: boolean;
  readonly multiPartModel: boolean;
  readonly resizable: boolean;
  readonly deformable: boolean;
  readonly texturable: boolean;
  readonly creator: string | undefined;
  readonly modelRotation: readonly number[] | undefined;
}

export interface Sh3fLibrary {
  readonly id: string | undefined;
  readonly name: string | undefined;
  readonly description: string | undefined;
  readonly version: string | undefined;
  readonly license: string | undefined;
  readonly provider: string | undefined;
  readonly assets: readonly Sh3fAsset[];
  readonly entries: ReadonlyMap<string, Uint8Array>;
}

export interface Sh3fImporterOptions {
  readonly locale?: string;
}
