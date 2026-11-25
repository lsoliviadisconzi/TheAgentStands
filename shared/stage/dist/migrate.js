const REMOVE = '— remove prop —';
let counter = 0;
const id = () => `cue_${Date.now().toString(36)}_${(counter++).toString(36)}`;
export function migrateStagefx(lines) {
    const cues = [];
    const push = (track, lineId, value) => {
        cues.push({ id: id(), track, anchor: { kind: 'line', line: lineId, at: 'start' }, value });
    };
    for (const l of lines) {
        const fx = l.fx ?? {};
        const mood = fx.mood ?? l.m;
        if (mood)
            push('mood', l.id, mood);
        if (fx.light)
            push('light', l.id, fx.light);
        if (fx.color)
            push('lightColor', l.id, fx.color);
        if (fx.room)
            push('room', l.id, fx.room);
        if (fx.propL)
            push('propL', l.id, fx.propL === REMOVE ? null : fx.propL);
        if (fx.propR)
            push('propR', l.id, fx.propR === REMOVE ? null : fx.propR);
        if (fx.badgeColor)
            push('badgeColor', l.id, fx.badgeColor);
        if (fx.badgeName)
            push('badgeName', l.id, fx.badgeName);
    }
    return cues;
}
