interface IBufferCfg {
  data: unknown[];
  imagePos?: unknown;
  uv?: boolean;
}
type Position = number[];
type Color = [number, number, number, number];
import { lngLatToMeters } from '@l7/utils';
import { vec3 } from 'gl-matrix';
export interface IBufferInfo {
  vertices?: any;
  indexArray?: any;
  indexOffset: any;
  verticesOffset: any;
  faceNum?: any;
  dimensions: number;
}
export interface IEncodeFeature {
  color?: Color;
  size?: number | number[];
  shape?: string | number;
  pattern?: string;
  id?: number;
  coordinates: Position[][];
  bufferInfo: IBufferInfo;
}
export default class Buffer {
  public attributes: {
    [key: string]: Float32Array;
  } = {};
  public verticesCount: number = 0;
  public indexArray: Uint32Array = new Uint32Array(0);
  public indexCount: number = 0;

  protected data: unknown[];
  protected imagePos: unknown;
  protected uv: boolean;

  constructor({ data, imagePos, uv }: IBufferCfg) {
    this.data = data;
    this.imagePos = imagePos;
    this.uv = !!uv;
    this.init();
  }
  public computeVertexNormals() {
    const normals = (this.attributes.normals = new Float32Array(
      this.verticesCount * 3,
    ));
    const indexArray = this.indexArray;
    const { positions } = this.attributes;
    let vA;
    let vB;
    let vC;
    const cb = vec3.create();
    const ab = vec3.create();
    const normal = vec3.create();
    for (let i = 0, li = indexArray.length; i < li; i += 3) {
      vA = indexArray[i + 0] * 3;
      vB = indexArray[i + 1] * 3;
      vC = indexArray[i + 2] * 3;
      const [ax, ay] = lngLatToMeters([positions[vA], positions[vA + 1]]);
      const pA = vec3.fromValues(ax, ay, positions[vA + 2]);
      const [bx, by] = lngLatToMeters([positions[vB], positions[vB + 1]]);
      const pB = vec3.fromValues(bx, by, positions[vB + 2]);
      const [cx, cy] = lngLatToMeters([positions[vC], positions[vC + 1]]);
      const pC = vec3.fromValues(cx, cy, positions[vC + 2]);
      vec3.sub(cb, pC, pB);
      vec3.sub(ab, pA, pB);
      vec3.cross(normal, cb, ab);
      normals[vA] += cb[0];
      normals[vA + 1] += cb[1];
      normals[vA + 2] += cb[2];
      normals[vB] += cb[0];
      normals[vB + 1] += cb[1];
      normals[vB + 2] += cb[2];
      normals[vC] += cb[0];
      normals[vC + 1] += cb[1];
      normals[vC + 2] += cb[2];
    }
    this.normalizeNormals();
  }

  // 计算每个要素顶点个数，记录索引位置
  protected calculateFeatures() {
    throw new Error('Method not implemented.');
  }
  protected buildFeatures() {
    throw new Error('Method not implemented.');
  }

  protected checkIsClosed(points: Position[][]) {
    const p1 = points[0][0];
    const p2 = points[0][points[0].length - 1];
    return p1[0] === p2[0] && p1[1] === p2[1];
  }

  protected concat(arrayType: Float32Array, arrays: any) {
    let totalLength = 0;
    for (const arr of arrays) {
      totalLength += arr.length;
    }
    const arrayBuffer = new ArrayBuffer(
      totalLength * arrayType.BYTES_PER_ELEMENT,
    );
    let offset = 0;
    // @ts-ignore
    const result = new arrayType(arrayBuffer);
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }
  protected encodeArray(feature: IEncodeFeature, num: number) {
    const { color, id, pattern, size } = feature;
    const { verticesOffset } = feature.bufferInfo;
    const imagePos = this.imagePos;
    const start1 = verticesOffset;
    for (let i = 0; i < num; i++) {
      if (color) {
        this.attributes.colors[start1 * 4 + i * 4] = color[0];
        this.attributes.colors[start1 * 4 + i * 4 + 1] = color[1];
        this.attributes.colors[start1 * 4 + i * 4 + 2] = color[2];
        this.attributes.colors[start1 * 4 + i * 4 + 3] = color[3];
      }
      if (id) {
        this.attributes.pickingIds[start1 + i] = id;
      }
      if (size) {
        let size2: number[] = [];
        if (Array.isArray(size) && size.length === 2) {
          // TODO 多维size支持
          size2 = [size[0]];
        }
        if (!Array.isArray(size)) {
          size2 = [size];
        }
        this.attributes.sizes.set(size2, (start1 + i) * size2.length);
      }
      if (pattern) {
        // @ts-ignore
        const patternPos = imagePos[pattern] || { x: 0, y: 0 };
        this.attributes.patterns[start1 * 2 + i * 2] = patternPos.x;
        this.attributes.patterns[start1 * 2 + i * 2 + 1] = patternPos.y;
      }
    }
  }
  protected calculateWall(feature: IEncodeFeature) {
    const size = feature.size || 0;
    const {
      vertices,
      indexOffset,
      verticesOffset,
      faceNum,
      dimensions,
    } = feature.bufferInfo;
    this.encodeArray(feature, faceNum * 4);
    for (let i = 0; i < faceNum; i++) {
      const prePoint = vertices.slice(i * dimensions, (i + 1) * dimensions);
      const nextPoint = vertices.slice(
        (i + 1) * dimensions,
        (i + 2) * dimensions,
      );
      this.calculateExtrudeFace(
        prePoint,
        nextPoint,
        verticesOffset + i * 4,
        indexOffset + i * 6,
        size as number,
      );
      feature.bufferInfo.verticesOffset += 4;
      feature.bufferInfo.indexOffset += 6;
    }
  }

  protected calculateExtrudeFace(
    prePoint: number[],
    nextPoint: number[],
    positionOffset: number,
    indexOffset: number | undefined,
    size: number,
  ) {
    this.attributes.positions.set(
      [
        prePoint[0],
        prePoint[1],
        size,
        nextPoint[0],
        nextPoint[1],
        size,
        prePoint[0],
        prePoint[1],
        0,
        nextPoint[0],
        nextPoint[1],
        0,
      ],
      positionOffset * 3,
    );
    const indexArray = [1, 2, 0, 3, 2, 1].map((v) => {
      return v + positionOffset;
    });
    if (this.uv) {
      this.attributes.uv.set(
        [0.1, 0, 0, 0, 0.1, size / 2000, 0, size / 2000],
        positionOffset * 2,
      );
    }
    this.indexArray.set(indexArray, indexOffset);
  }

  private init() {
    // 将每个多边形三角化，存储顶点坐标和索引坐标
    this.calculateFeatures();
    // 拼接成一个 attribute
    this.initAttributes();
    this.buildFeatures();
  }

  private initAttributes() {
    this.attributes.positions = new Float32Array(this.verticesCount * 3);
    this.attributes.colors = new Float32Array(this.verticesCount * 4);
    this.attributes.pickingIds = new Float32Array(this.verticesCount);
    this.attributes.sizes = new Float32Array(this.verticesCount);
    this.attributes.pickingIds = new Float32Array(this.verticesCount);
    if (this.uv) {
      this.attributes.uv = new Float32Array(this.verticesCount * 2);
    }
    this.indexArray = new Uint32Array(this.indexCount);
  }

  private normalizeNormals() {
    const { normals } = this.attributes;
    for (let i = 0, li = normals.length; i < li; i += 3) {
      const normal = vec3.fromValues(
        normals[i],
        normals[i + 1],
        normals[i + 2],
      );
      const newNormal = vec3.create();
      vec3.normalize(newNormal, normal);
      normals.set(newNormal, i);
    }
  }
}
