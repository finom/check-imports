export default function countDependencies(count: number, adjective = ''): string {
  return `${count} ${adjective ? `${adjective} ` : ''}${count === 1 ? 'dependency' : 'dependencies'}`;
}
