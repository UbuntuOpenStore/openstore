declare module 'openstore-dpkg' {
    /**
     * Compare two debian version strings using dpkg's version comparison algorithm
     *
     * @param v1 First version string
     * @param v2 Second version string
     * @returns number:
     *    v1 < v2 : <0
     *    v1 = v2 : 0
     *    v1 > v2 : >0
     */
    export function compareVersions(v1: string, v2: string): number;

    /**
     * Check if a version string is a valid debian version number
     *
     * @param version Version string to check
     * @returns boolean True if valid, false otherwise
     */
    export function isValidVersion(version: string): boolean;

    export default compareVersions;
}
