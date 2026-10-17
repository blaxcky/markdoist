// Ordnerwahl über SAF mit dauerhafter Freigabe (Plan 7.3); erneute Freigabe ist eine Reparaturaktion.
import { createContext, use } from "react";
export interface FolderApi {
  name: string;
  choose(): Promise<void>;
}
export const FolderContext = createContext<FolderApi>({ name: "", choose: async () => {} });
export const useFolder = () => use(FolderContext);
