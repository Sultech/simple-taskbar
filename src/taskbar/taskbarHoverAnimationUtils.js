export function getTaskbarHoverAnimationNeighbours(
    taskbarBin,
    startButtonActor,
    taskbarViewport
) {
    return [
        ...taskbarBin.get_children(),
        startButtonActor,
    ].filter(actor => actor !== taskbarViewport && actor.visible);
}

export function applySmoothedProperties(actor, targets, smoothing, epsilon) {
    let settled = true;
    for (const [property, target] of Object.entries(targets)) {
        actor.remove_transition(property);
        const current = actor[property];
        const next = current + (target - current) * smoothing;
        if (Math.abs(target - next) < epsilon) {
            actor[property] = target;
            continue;
        }

        actor[property] = next;
        settled = false;
    }

    return settled;
}
