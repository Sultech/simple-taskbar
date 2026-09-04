export function getTaskbarHoverAnimationNeighbours(
    taskbarBin,
    startButtonActor,
    taskbarViewport,
    panelBoxes
) {
    const neighbours = [
        ...taskbarBin.get_children(),
        startButtonActor,
    ].filter(actor => actor !== taskbarViewport && actor.visible);
    for (const box of panelBoxes) {
        for (const child of box.get_children()) {
            if (child.visible && !child.contains(taskbarBin) &&
                !child.contains(startButtonActor)) {
                neighbours.push(child);
            }
        }
    }

    return neighbours;
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
