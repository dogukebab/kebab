using System.Collections.Concurrent;
using System.Linq;
using System.Threading.Tasks;

namespace MySite.Web.Services
{
    // Message DTO we persist in memory (can swap to EF later)
    public record ChatMessage(
        string Id,
        string ChatId,   // guest connection id
        string From,     // "Guest-XXXX" or "Support"
        string Text,
        long Ts,
        bool Deleted = false
    );

    public interface IChatStore
    {
        Task SaveAsync(ChatMessage msg);
        Task<bool> SoftDeleteAsync(string messageId);
        Task<IReadOnlyList<ChatMessage>> GetChatAsync(string chatId);

        // NEW: soft-delete (clear) all messages in a chat
        Task<int> ClearChatAsync(string chatId);
    }

    // Simple in-memory store (thread-safe)
    public class InMemoryChatStore : IChatStore
    {
        private readonly ConcurrentDictionary<string, ChatMessage> _messages = new();

        public Task SaveAsync(ChatMessage msg)
        {
            _messages[msg.Id] = msg;
            return Task.CompletedTask;
        }

        public Task<bool> SoftDeleteAsync(string messageId)
        {
            if (_messages.TryGetValue(messageId, out var m))
            {
                _messages[messageId] = m with { Deleted = true };
                return Task.FromResult(true);
            }
            return Task.FromResult(false);
        }

        public Task<IReadOnlyList<ChatMessage>> GetChatAsync(string chatId)
        {
            var list = _messages.Values
                .Where(m => m.ChatId == chatId)
                .OrderBy(m => m.Ts)
                .ToList();
            return Task.FromResult<IReadOnlyList<ChatMessage>>(list);
        }

        // NEW
        public Task<int> ClearChatAsync(string chatId)
        {
            int count = 0;
            foreach (var kv in _messages.ToArray())
            {
                var m = kv.Value;
                if (m.ChatId == chatId && !m.Deleted)
                {
                    _messages[kv.Key] = m with { Deleted = true };
                    count++;
                }
            }
            return Task.FromResult(count);
        }
    }
}
