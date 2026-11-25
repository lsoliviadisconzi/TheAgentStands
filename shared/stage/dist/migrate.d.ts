import type { Cue } from './cues';
export interface LegacyLine {
    id: string;
    m?: string;
    fx?: {
        mood?: string;
        light?: string;
        color?: string;
        room?: string;
        propL?: string;
        propR?: string;
        badgeColor?: string;
        badgeName?: string;
    };
}
export declare function migrateStagefx(lines: LegacyLine[]): Cue[];
//# sourceMappingURL=migrate.d.ts.map