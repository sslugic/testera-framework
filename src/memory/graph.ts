import type { StateNode, TransitionEdge, Observation } from '../types/index.js';
import { FingerprintEngine } from './fingerprint.js';

export class ExplorationGraph {
  private nodes: Map<string, StateNode> = new Map();
  private edges: TransitionEdge[] = [];

  getOrCreateNode(observation: Observation): StateNode {
    const id = FingerprintEngine.createPageHash(observation);

    let node = this.nodes.get(id);
    if (!node) {
      const unexplored = observation.interactiveElements.map((e) => e.index);
      node = {
        id,
        url: observation.url,
        title: observation.title,
        visitedCount: 1,
        unexploredElements: unexplored,
        exploredElements: [],
        screenshotPath: observation.screenshotPath,
        createdAt: Date.now(),
      };
      this.nodes.set(id, node);
    } else {
      node.visitedCount++;
    }

    return node;
  }

  markElementExplored(nodeId: string, elementIndex: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    node.unexploredElements = node.unexploredElements.filter((idx) => idx !== elementIndex);
    if (!node.exploredElements.includes(elementIndex)) {
      node.exploredElements.push(elementIndex);
    }
  }

  getUnexploredElements(nodeId: string): number[] {
    const node = this.nodes.get(nodeId);
    return node ? node.unexploredElements : [];
  }

  recordTransition(edge: TransitionEdge): void {
    this.edges.push(edge);
  }

  getAllNodes(): StateNode[] {
    return Array.from(this.nodes.values());
  }

  getAllEdges(): TransitionEdge[] {
    return this.edges;
  }

  getSummary(): {
    totalStates: number;
    totalTransitions: number;
    totalExploredElements: number;
    unexploredCount: number;
  } {
    let totalExplored = 0;
    let unexploredCount = 0;

    for (const node of this.nodes.values()) {
      totalExplored += node.exploredElements.length;
      unexploredCount += node.unexploredElements.length;
    }

    return {
      totalStates: this.nodes.size,
      totalTransitions: this.edges.length,
      totalExploredElements: totalExplored,
      unexploredCount,
    };
  }
}
