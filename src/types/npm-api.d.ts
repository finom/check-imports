declare module 'npm-api' {
    import type { PackageJson } from "type-fest";

    type Repo = {
      package(): Promise<PackageJson>;
    };
  
    export default class NpmApi {
      repo(packageName: string): Repo;
    }
  }
  