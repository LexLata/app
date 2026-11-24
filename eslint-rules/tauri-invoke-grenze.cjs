// Nur das Befehlsmodul darf Tauris ungetypten invoke-Zugang verwenden.
// Herkunftsverfolgung erfasst auch Aliase, await und Promise-Callbacks.
module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      grenze: 'Native Befehle ausschließlich über tauri-befehle.index und rufeBefehl aufrufen.',
    },
  },
  create(context) {
    const datei = context.filename.replace(/\\/g, '/');
    if (
      /\/tauri-befehle\//.test(datei) ||
      /\.test\.[cm]?[jt]sx?$/.test(datei) ||
      /(?:^|\/)src\/test\//.test(datei)
    )
      return {};
    const module = new Set();
    const herkunft = new Map();
    const kern = '@tauri-apps/api/core';
    const name = (n) => n?.name ?? n?.value;
    function istKern(n, besucht = new Set()) {
      if (!n || besucht.has(n)) return false;
      besucht.add(n);
      if (n.type === 'ImportExpression') return n.source.value === kern;
      if (
        n.type === 'AwaitExpression' ||
        n.type === 'TSAsExpression' ||
        n.type === 'ChainExpression' ||
        n.type === 'TSNonNullExpression'
      )
        return istKern(n.argument ?? n.expression, besucht);
      if (n.type === 'Identifier')
        return module.has(n.name) || istKern(herkunft.get(n.name), besucht);
      return false;
    }
    function pruefeMuster(muster) {
      if (muster?.type === 'ObjectPattern') {
        for (const p of muster.properties)
          if (name(p.key) === 'invoke') context.report({ node: p, messageId: 'grenze' });
      }
    }
    return {
      ImportDeclaration(n) {
        if (n.source.value !== kern) return;
        for (const s of n.specifiers) {
          if (s.type === 'ImportNamespaceSpecifier') module.add(s.local.name);
          if (s.type === 'ImportSpecifier' && name(s.imported) === 'invoke')
            context.report({ node: s, messageId: 'grenze' });
        }
      },
      ExportNamedDeclaration(n) {
        if (n.source?.value !== kern) return;
        for (const s of n.specifiers)
          if (name(s.local) === 'invoke') context.report({ node: s, messageId: 'grenze' });
      },
      ExportAllDeclaration(n) {
        if (n.source.value === kern) context.report({ node: n, messageId: 'grenze' });
      },
      VariableDeclarator(n) {
        if (n.id.type === 'Identifier') herkunft.set(n.id.name, n.init);
        if (istKern(n.init)) pruefeMuster(n.id);
      },
      AssignmentExpression(n) {
        if (n.left.type === 'Identifier') herkunft.set(n.left.name, n.right);
        if (istKern(n.right)) pruefeMuster(n.left);
      },
      MemberExpression(n) {
        if (name(n.property) === 'invoke' && istKern(n.object))
          context.report({ node: n, messageId: 'grenze' });
      },
      CallExpression(n) {
        if (
          n.callee.type !== 'MemberExpression' ||
          name(n.callee.property) !== 'then' ||
          !istKern(n.callee.object)
        )
          return;
        const callback = n.arguments[0];
        if (!callback || !['ArrowFunctionExpression', 'FunctionExpression'].includes(callback.type))
          return;
        const parameter = callback.params[0];
        if (parameter?.type === 'Identifier') module.add(parameter.name);
        pruefeMuster(parameter);
      },
    };
  },
};
