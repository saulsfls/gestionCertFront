

export interface UnidadItem {
  simbolo: string;
  nombre: string;
  factor: string;
  prefijo: string;
}

export interface MagnitudCatalogo {
  nombre: string;
  unidades: UnidadItem[];
}

export type MagnitudesMap = Record<string, MagnitudCatalogo>;

export interface SubparametroCatalogo {
  id: string;
  displayName: string;
  label?: string;
  unidadesOverride?: string[] | null;
}

export interface TituloCatalogo {
  displayName: string;
  label?: string;
  magnitud: string;          // clave de MagnitudesMap, o '*' para comodín
  subparametros: SubparametroCatalogo[];
}

export type TitulosMap = Record<string, TituloCatalogo>;

export interface CatalogoCompleto {
  titulos: TitulosMap;
  unidades: MagnitudesMap;
}


// DTOs para los POST


export interface CrearTituloDto {
  displayName: string;
  label?: string;
  magnitud: string;
  subparametrosIniciales?: Array<{
    displayName: string;
    label?: string;
    unidadesOverride?: string[] | null;
  }>;
}

export interface CrearSubparametroDto {
  tituloId: string;
  displayName: string;
  label?: string;
  unidadesOverride?: string[] | null;
}

export interface CrearUnidadDto {
  magnitud: string;
  simbolo: string;
  nombre: string;
  factor?: string;
  prefijo?: string;
}

export interface CrearMagnitudDto {
  id: string;
  nombre: string;
  unidadesIniciales?: Array<{
    simbolo: string;
    nombre: string;
    factor?: string;
    prefijo?: string;
  }>;
}


// Respuesta estándar del backend


export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  total?: number;
}

export interface ApiError {
  ok: false;
  code?: string | null;
  errno?: number | null;
  sqlState?: string | null;
  column?: string | null;
  message: string;
  detail?: string;
}
